import type {IFileSystem} from '@itookit/vfs-core';
import type {ImageSource} from './contracts.js';
import {check, ImageProcessingError} from './validation.js';

/** The caller supplies an authorized view and a resource-specific revision reader. */
export function createVfsImageSource(fs: IFileSystem, options: {id: string; revision: string; name: string;
    path: string; mimeType?: string; getRevision(signal: AbortSignal): Promise<string>}): ImageSource {
    return {id: options.id, revision: options.revision, name: options.name, async read({signal}) {
        check(signal);
        if (await options.getRevision(signal) !== options.revision) throw new ImageProcessingError('conflict');
        const bytes = await fs.driver.readContent(options.path, {encoding: 'binary', signal}); check(signal);
        if (await options.getRevision(signal) !== options.revision) throw new ImageProcessingError('conflict');
        return new Blob([bytes], {type: options.mimeType});
    }};
}
