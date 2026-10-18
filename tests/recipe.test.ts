import {expect, it} from 'vitest';
import type {ImageSpec} from '../src/contracts';
import {validateSpec} from '../src/validation';
import {recipeGeometry} from '../src/recipe';

it('maps a crop on a perspective-corrected image back to the original projective plane', () => {
    const spec: ImageSpec = {version: 2, steps: [{kind: 'quad', points: [{x: 0.2, y: 0.1}, {x: 0.8, y: 0.1}, {x: 1, y: 0.9}, {x: 0, y: 0.9}]}],
        selection: {kind: 'rect', x: 0.5, y: 0, width: 0.5, height: 0.5}};
    const result = recipeGeometry(spec, 1000, 1000);
    const expected = [{x: 500, y: 100}, {x: 800, y: 100}, {x: 875, y: 400}, {x: 500, y: 400}];
    result.points.forEach((point, index) => {expect(point.x).toBeCloseTo(expected[index].x); expect(point.y).toBeCloseTo(expected[index].y);});
    expect(result.size).toEqual({width: 500, height: 413});
});
it('validates every persisted step and bounds work while accepting old version-one drafts', () => {
    expect(validateSpec({version: 1, selection: {kind: 'none'}}).version).toBe(1);
    const bad: ImageSpec = {version: 2, steps: [{kind: 'rect', x: 0.9, y: 0, width: 0.5, height: 1}], selection: {kind: 'none'}};
    expect(() => validateSpec(bad)).toThrow('invalid-selection');
    expect(() => validateSpec({version: 2, steps: Array.from({length: 101}, () => ({kind: 'none'})), selection: {kind: 'none'}})).toThrow('invalid-selection');
});
