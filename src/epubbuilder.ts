import archiver from 'archiver';
import xml from 'xml';
import StreamZip from 'node-stream-zip';
import { PassThrough, Writable } from 'stream';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import FileType from 'file-type';

interface Page {
    mime: string,
    path: string,
    id: string,
}

interface Chapter {
    name: string,
    id: string,
    pages: Page[],
}

interface xmlEntry {
    [key: string]: string | xmlEntry | (xmlEntry | string)[],
}

export class EPubBuilder {
    private archive;
    private chapters: Chapter[] = [];
    private cover: Page | null = null;
    
    constructor() {
        this.archive = archiver('zip', {
            zlib: { level: 0 }, // Just store it
        });

        // Mimetype need to be located at first
        this.archive.append('application/epub+zip', {
            name: 'mimetype',
        });
    }

    private getContainer(): string {
        const epubContainer = {
            container: [{
                _attr: {
                    version: '1.0',
                    xmlns: 'urn:oasis:names:tc:opendocument:xmlns:container',
                },
            }, {
                rootfiles: [{
                    rootfile: {_attr: {'full-path': 'OEBPS/content.opf', 'media-type': 'application/oebps-package+xml'}}
                }],
            }],
        };

        return xml(epubContainer, {
            declaration: {
                encoding: 'utf-8',
            },
        });
    }

    private getOpf(): string {
        const metadata: xmlEntry[] = [{
            _attr: {
                'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
                'xmlns:opf': 'http://www.idpf.org/2007/opf',
            },
        }, {
            'dc:identifier': [{
                _attr: {
                    id: 'BookId',
                },
            }, `urn:uuid:${uuidv4()}`]
        }];

        // TODO: Un-hardcode me.
        const metaObj: {[key: string]: string} = {
            'dc:title': 'test',
            'dc:language': 'ko',
            'dc:creator': 'test',
        }

        for(const k of Object.keys(metaObj)) {
            const obj = {} as xmlEntry;

            obj[k] = metaObj[k];
            metadata.push(obj);
        }

        const manifest: xmlEntry[] = [{
            item: [{
                _attr: {
                    href: this.cover!.path,
                    id: this.cover!.id,
                    'media-type': this.cover!.mime,
                    properties: 'cover-image',
                },
            }]
        }];

        for(const chapter of this.chapters) {
            for(const page of chapter.pages) {
                manifest.push({
                    item: [{
                        _attr: {
                            href: page.path,
                            id: page.id,
                            'media-type': page.mime,
                        },
                    }],
                });
            }
        }
        
        // TODO: Add CSS & XHTML & fonts, etc.

        const opf = {
            package: [{
                _attr: {
                    xmlns: 'http://www.idpf.org/2007/opf',
                    prefix: 'rendition: http://www.idpf.org/vocab/rendition/#',
                    'unique-identifier': 'BookId',
                    version: '3.0',
                }
            }, {
                metadata: metadata,
            }, {
                manifest: manifest,
            }]
        };

        return xml(opf, {
            declaration: {
                encoding: 'utf-8',
                standalone: 'no'
            }
        })
    }

    async init() {
    }

    async addCover(data: Buffer) {
        const mime = await FileType.fromBuffer(data);
        const imgPath = `OEBPS/Images/cover.${mime!.ext}`;
        this.cover = {
            mime: mime!.mime,
            path: imgPath,
            id: uuidv4(),
        };

        this.chapters[0] = {
            name: 'Cover',
            id: uuidv4(),
            pages: [this.cover],
        };

        this.archive.append(data, {
            name: imgPath,
        });
    }

    async setChapterMeta(chapterIdx: number, name: string) {
        if (this.chapters[chapterIdx] == null) {
            this.chapters[chapterIdx] = {
                name: name,
                id: uuidv4(),
                pages: [],
            };
        } else {
            this.chapters[chapterIdx].name = name;
        }
    }

    async addPage(chapterIdx: number, data: Buffer, filename: string | null) {
        if (chapterIdx === 0) {
            throw new Error('Chapter 0 is reserved as cover')
        }

        const id = uuidv4();
        const mime = await FileType.fromBuffer(data);
        if (filename == null) {
            filename = `${id}.${mime!.ext}`;
        }

        const imgPath = path.join('OEBPS/Images', filename!);

        if (this.chapters[chapterIdx] == null) {
            this.chapters[chapterIdx] = {
                name: '',
                id: uuidv4(),
                pages: [],
            }
        }

        this.chapters[chapterIdx].pages.push({
            mime: mime!.mime,
            path: imgPath,
            id: id,
        });

        this.archive.append(data, {
            name: imgPath,
        });
    }
    
    finalize() {
        // Write ePub metadata & pages to the zip
        // Container
        this.archive.append(this.getContainer(), {
            name: 'META-INF/container.xml',
        });

        // content.opf
        this.archive.append(this.getOpf(), {
            name: 'OEBPS/content.opf',
        });
        
        this.archive.finalize();
    }

    pipe(stream: Writable) {
        this.archive.pipe(stream);
    }
}