import {createBlobSource, createImageProcessor, DEFAULT_IMAGE_SPEC} from '../src/index.js';
import type {ImageRecipe} from '../src/processing.js';
function assert(value: unknown, message: string): asserts value {if (!value) throw new Error(message);}
Object.assign(window,{runImageChecks:async()=>{
    const canvas=document.createElement('canvas');canvas.width=200;canvas.height=100;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#e03070';ctx.fillRect(0,0,200,100);
    const blob=await new Promise<Blob>(resolve=>canvas.toBlob(value=>resolve(value!),'image/png'));
    const source=createBlobSource(blob,{id:'source',revision:'1',name:'fixture.png'}), processor=createImageProcessor(), signal=new AbortController().signal;
    const recipe:ImageRecipe={version:1,resize:{mode:'max-edge',maxEdge:100},color:'grayscale',output:{mimeType:'image/jpeg',quality:0.9,minQuality:0.6,maxBytes:5000}};
    try {
        const result=await processor.process(source,DEFAULT_IMAGE_SPEC,{recipe,signal});
        assert(result.width===100&&result.height===50&&result.mimeType==='image/jpeg'&&result.byteLength<=5000,'Output dimensions, encoding and bytes');
        const bitmap=await createImageBitmap(result.blob);ctx.clearRect(0,0,200,100);ctx.drawImage(bitmap,0,0);bitmap.close();
        const [r,g,b]=ctx.getImageData(10,10,1,1).data;assert(r===g&&g===b,'Actual grayscale pixels');
        const threshold=await processor.process(source,DEFAULT_IMAGE_SPEC,{recipe:{...recipe,color:'threshold',threshold:200,output:{mimeType:'image/png',quality:1}},signal});
        const bw=await createImageBitmap(threshold.blob);ctx.drawImage(bw,0,0);bw.close();
        assert(ctx.getImageData(10,10,1,1).data[0]===0,'Threshold produces black');
        let failed=false;try{await processor.process(source,DEFAULT_IMAGE_SPEC,{recipe:{...recipe,output:{...recipe.output,maxBytes:1}},signal});}catch{failed=true;}
        assert(failed,'Quality floor fails rather than shrinking text');
        assert(await source.read({signal})===blob,'Original remains immutable');
        return ['resize 200x100 to 100x50','real grayscale and threshold pixels','JPEG output byte budget','minimum-quality rejection','original preserved'];
    }finally{await processor.dispose();}
}});
