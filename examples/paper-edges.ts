import {detectPaperBoundary} from './page-lines';
const canvas = document.querySelector('canvas')!, ctx = canvas.getContext('2d')!;
const assert = (value: unknown, message: string) => {if (!value) throw new Error(message);};
function detect(image: CanvasImageSource, width: number, height: number) {
    const scale = Math.min(1, 800 / Math.max(width, height));
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return detectPaperBoundary(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
}
async function photo(url: string) {
    const image = new Image(); image.src = url; await image.decode();
    const result = detect(image, image.naturalWidth, image.naturalHeight);
    if (result) {
        ctx.strokeStyle = '#14e08c'; ctx.lineWidth = 4; ctx.beginPath();
        result.corners.forEach((p, i) => {if (i) ctx.lineTo(p.x * canvas.width, p.y * canvas.height); else ctx.moveTo(p.x * canvas.width, p.y * canvas.height);});
        ctx.closePath(); ctx.stroke();
    }
    document.querySelector('[role=status]')!.textContent = !result ? '未找到可用边界' : result.status === 'partial' ? '检测到纸边，部分角点超出画面；不能恢复画面外内容' : '找到完整四边形，请核对边界';
    return {result, overlay: canvas.toDataURL('image/jpeg', 0.9)};
}
function synthetic(partial: boolean) {
    const plane = document.createElement('canvas'); plane.width = 600; plane.height = 800;
    const g = plane.getContext('2d')!; g.fillStyle = '#222'; g.fillRect(0, 0, 600, 800); g.fillStyle = '#ddd';
    const q = partial ? [[150, 40], [648, 96], [540, 880], [-90, 704]] : [[100, 80], [500, 80], [500, 700], [100, 700]];
    g.beginPath(); q.forEach(([x, y], i) => {if (i) g.lineTo(x, y); else g.moveTo(x, y);}); g.closePath(); g.fill();
    g.fillStyle = '#111'; g.font = '18px sans-serif';
    for (let y = 180; y < 620; y += 35) g.fillText('Document text and internal lines', 180, y);
    return detectPaperBoundary(g.getImageData(0, 0, 600, 800).data, 600, 800);
}
async function checks(url?: string | null) {
    if (url) return photo(url);
    const full = synthetic(false), partial = synthetic(true);
    assert(full?.status === 'complete', 'Synthetic full page has complete corners');
    assert(Math.abs(full!.corners[0].x - 1 / 6) < 0.03 && Math.abs(full!.corners[0].y - 0.1) < 0.03, 'Outer page edges outrank text');
    assert(partial?.status === 'partial', 'Out-of-frame corners are reported rather than clamped');
    const blank = new Uint8ClampedArray(600 * 800 * 4); blank.fill(255);
    assert(detectPaperBoundary(blank, 600, 800) === null, 'A blank image has no inferred paper boundary');
    assert(detectPaperBoundary(new Uint8ClampedArray(blank.length), 600, 800) === null, 'A dark blank image has no boundary');
    return ['full page outer edges', 'partial page extrapolation', 'blank and dark frames rejected'];
}
document.querySelector('input')!.addEventListener('change', async event => {
    const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
    const url = URL.createObjectURL(file);
    try {await photo(url);} catch (error) {document.querySelector('[role=status]')!.textContent = String(error);}
    finally {URL.revokeObjectURL(url);}
});
Object.assign(window, {runImageChecks: checks});
