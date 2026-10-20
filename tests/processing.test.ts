import {expect, it} from 'vitest';
import {encodingQualities, validateImageRecipe, type ImageRecipe} from '../src/processing.js';
const recipe:ImageRecipe={version:1,resize:{mode:'max-edge',maxEdge:1024},color:'grayscale',output:{mimeType:'image/jpeg',quality:0.9,minQuality:0.6,maxBytes:10000}};
it('validates portable recipes and creates bounded encoding attempts without mutating input',()=>{
    expect(encodingQualities(validateImageRecipe(recipe))).toEqual([0.9,0.825,0.75,0.675,0.6]);
    const captured=validateImageRecipe(recipe);expect(captured).toEqual(recipe);expect(captured).not.toBe(recipe);
    expect(encodingQualities({...recipe,output:{...recipe.output,mimeType:'image/png'}})).toEqual([0.9]);
    expect(()=>validateImageRecipe({...recipe,output:{...recipe.output,minQuality:1}})).toThrow('invalid-policy');
    expect(()=>validateImageRecipe({...recipe,threshold:256})).toThrow('invalid-policy');
});
