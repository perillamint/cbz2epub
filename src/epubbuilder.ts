import archiver from 'archiver';
import xml from 'xml';
import StreamZip from 'node-stream-zip';
import { PassThrough, Writable } from 'stream';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import FileType from 'file-type';
import {promises as fs} from 'fs'
import moment from 'moment-timezone';
import {BookMeta, Page, Chapter, xmlEntry} from './types';
import {xhtmlBuilder} from './xhtmlBuilder';

const basePath = 'OPS';
const xhtmlBasePath = path.join(basePath, 'xhtml');
const imgBasePath = path.join(basePath, 'img');
const cssBasePath = path.join(basePath, 'css');

export class EPubBuilder {
    private archive;
    private chapters: Chapter[] = [];
    private cover: Page | null = null;
    private meta: BookMeta;
    private uuid: string;
    
    constructor(bookMeta: BookMeta) {
        this.meta = bookMeta;
        this.uuid = uuidv4();
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
                    rootfile: {_attr: {'full-path': path.join(basePath, 'content.opf'), 'media-type': 'application/oebps-package+xml'}}
                }],
            }],
        };

        return xml(epubContainer, {
            declaration: {
                encoding: 'utf-8',
            },
        });
    }

    private getNcx(): string {
        const ncx: xmlEntry[] = [{
            'ncx:ncx': [{
                _attr: {
                    'xmlns:ncx': 'http://www.daisy.org/z3986/2005/ncx/',
                    version: '2005-1',
                },
            }, {
                'ncx:head': [{
                    'ncx:meta': [{
                        _attr: {
                            name: 'dtb:uid',
                            content: `urn:uuid:${this.uuid}`,
                        }
                    }],
                }, {
                    'ncx:meta': [{
                        _attr: {
                            name: 'dtb:depth',
                            content: '-1',
                        }
                    }],
                }, {
                    'ncx:meta': [{
                        _attr: {
                            name: 'dtb:totalPageCount',
                            content: '0',
                        }
                    }],
                }, {
                    'ncx:meta': [{
                        _attr: {
                            name: 'dtb:maxPageNumber',
                            content: '0',
                        }
                    }]
                }],
            }, {
                'ncx:docTitle': [{
                    'ncx:text': [this.meta.title],
                }],
            }, {
                'ncx:docAuthor': [{
                    'ncx:text': [this.meta.creator],
                }],
            }, {
                'ncx:navMap': [{
                    'ncx:navPoint': [{
                        _attr: {
                            id: 'p1',
                            playOrder: '1',
                        },
                    }, {
                        'ncx:navLabel': [{
                            'ncx:text': [this.meta.title],
                        }],
                    }, {
                        'ncx:content': [{
                            _attr: {
                                src: path.relative(basePath, this.chapters[0].pages[0].xhtmlPath),
                            },
                        }],
                    }],
                }],
            }],
        }];
        return xml(ncx, {
            declaration: {
                encoding: 'utf-8',
                standalone: 'no'
            }
        })
    }

    private getOpf(): string {
        const metadata: xmlEntry[] = [{
            _attr: {
                'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
                'xmlns:opf': 'http://www.idpf.org/2007/opf',
            },
        }, {
            meta: [{
                _attr: {
                    property: 'dcterms:modified',
                },
            }, moment().tz('UTC').format('YYYY-MM-DDTHH:mm:ss') + 'Z'],
        },{
            'dc:identifier': [{
                _attr: {
                    id: 'BookId',
                },
            }, `urn:uuid:${this.uuid}`]
        }];

        const metaObj: {[key: string]: string} = {};
        const metaEnts = Object.entries(this.meta);
        for(const metaEnt of metaEnts) {
            if (metaEnt[1] == null) {
                continue;
            }

            if (metaEnt[0] === 'bookUUID') {
                // TODO: Implement method to properly implement dc:identifier
            } else if (metaEnt[0] === 'direction') {
                continue;
            } else {
                metaObj[`dc:${metaEnt[0]}`] = metaEnt[1];
            }
        }

        for(const k of Object.keys(metaObj)) {
            const obj = {} as xmlEntry;

            obj[k] = metaObj[k];
            metadata.push(obj);
        }

        const manifest: xmlEntry[] = [];
        const spine: xmlEntry[] = [{
            _attr: {
                toc: 'ncxtoc',
                'page-progression-direction': this.meta.direction,
            },
        }];

        let pageCnt = 0;
        for(const chapter of this.chapters) {
            for(const page of chapter.pages) {
                pageCnt += 1;
                manifest.push({
                    item: [{
                        _attr: {
                            href: path.relative(basePath, page.path),
                            id: page.id,
                            'media-type': page.mime,
                        },
                    }],
                });
                manifest.push({
                    item: [{
                        _attr: {
                            href: path.relative(basePath, page.xhtmlPath),
                            id: page.xhtmlId,
                            'media-type': 'application/xhtml+xml',
                        }
                    }]
                })
                let pageSpread: string | null = null;

                if (this.meta.direction === 'rtl') {
                    pageSpread = pageCnt % 2 === 1 ? 'page-spread-left' : 'page-spread-right';
                } else if (this.meta.direction === 'ltr') {
                    pageSpread = pageCnt % 2 === 1 ? 'page-spread-right' : 'page-spread-left';
                }
                spine.push({
                    itemref: [{
                        _attr: {
                            idref: page.xhtmlId,
                            properties: pageSpread === null ? '' : pageSpread,
                        },
                    }],
                });
            }
        }

        ((manifest[0].item as xmlEntry[])[0]._attr as xmlEntry)['properties'] = 'cover-image'
       
        // TODO: Un-hardcode thios
        manifest.push({
            item: [{
                _attr: {
                    href: 'css/main.css',
                    id: 'css_main_css',
                    'media-type': 'text/css',
                }
            }]
        });

        manifest.push({
            item: [{
                _attr: {
                    href: 'nav.xhtml',
                    id: 'nav',
                    properties: 'nav',
                    'media-type': 'application/xhtml+xml',
                },
            }],
        });

        manifest.push({
            item: [{
                _attr: {
                    id: 'ncxtoc',
                    href: 'toc.ncx',
                    'media-type': 'application/x-dtbncx+xml',
                },
            }],
        });

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
            }, {
                spine: spine,
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
        const imgPath = path.join(basePath, `img/cover.${mime!.ext}`);
        const imgPathRel = path.relative(xhtmlBasePath, imgPath);
        const xhtmlPath = path.join(xhtmlBasePath, 'cover.xhtml');
        const alt = 'Sorry, no OCR\'ed ALT available for now.';
        this.cover = {
            mime: mime!.mime,
            path: imgPath,
            xhtmlPath: xhtmlPath,
            id: `cover_${mime!.ext}`,
            xhtmlId: 'cover_xhtml',
        };

        this.chapters[0] = {
            name: 'Cover',
            pages: [this.cover],
        };

        this.archive.append(data, {
            name: imgPath,
        });
        this.archive.append(await xhtmlBuilder(data, imgPathRel, alt, this.meta), {
            name: xhtmlPath
        });
    }

    async setChapterMeta(chapterIdx: number, name: string) {
        if (this.chapters[chapterIdx] == null) {
            this.chapters[chapterIdx] = {
                name: name,
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

        const id = filename != null ? `IMAGE_${filename}`.replaceAll('/', '_').replaceAll('.', '_') : uuidv4();
        const xhtmlId = filename != null ? `XHTML_${filename}`.replaceAll('/', '_').replaceAll('.', '_') : uuidv4();
        const mime = await FileType.fromBuffer(data);
        const alt = 'Sorry, no OCR\'ed ALT available for now.';
        if (filename == null) {
            filename = `${id}.${mime!.ext}`;
        }

        const imgPath = path.join(imgBasePath, filename!);
        const imgPathRel = path.relative(xhtmlBasePath, imgPath);
        const xhtmlPath = path.join(xhtmlBasePath, `${filename}.xhtml`);

        if (this.chapters[chapterIdx] == null) {
            this.chapters[chapterIdx] = {
                name: '',
                pages: [],
            }
        }

        this.chapters[chapterIdx].pages.push({
            mime: mime!.mime,
            path: imgPath,
            xhtmlPath: xhtmlPath,
            id: id,
            xhtmlId: xhtmlId,
        });

        this.archive.append(data, {
            name: imgPath,
        });
        this.archive.append(await xhtmlBuilder(data, imgPathRel, alt, this.meta), {
            name: xhtmlPath
        });
    }

    async getChapterXHTML(chapter: Chapter): Promise<string> {
        const bodyContent: xmlEntry[] = [];
        for(const page of chapter.pages) {
            bodyContent.push({
                div: [{
                    _attr: {
                        class: 'w100',
                        role: 'doc-pagebreak',
                        'aria-label': page.id,
                        id: page.id,
                    },
                }, {
                    img: [{
                        _attr: {
                            alt: `Image ID: ${page.id}, sorry, no proper OCRed ALT here.`,
                            class: 'w100',
                            src: path.relative(xhtmlBasePath, page.path),
                        }
                    }],
                }],
            });
        }

        const chapterXHTML = {
            html: [{
                _attr: {
                    xmlns: 'http://www.w3.org/1999/xhtml',
                    'xml:lang': this.meta.language,
                }
            }, {
                head: [{
                    title: this.meta.title,
                }, {
                    link: [{
                        _attr: {
                            // TODO: Unhardcode the path
                            href: path.relative(xhtmlBasePath, path.join(cssBasePath, 'main.css')),
                            rel: 'stylesheet',
                            type: 'text/css',
                        }
                    }]
                }],
            }, {
                body: bodyContent,
            }],
        };

        return xml(chapterXHTML, {
            declaration: {
                encoding: 'utf-8',
                standalone: 'no'
            }
        })
    }

    async getNav(): Promise<string> {
        const tocnav: xmlEntry[] = [];
        const pagelistnav: xmlEntry[] = [];

        let pagecnt = 0;
        for(const chapter of this.chapters) {
            for(const page of chapter.pages) {
                pagecnt += 1;
                pagelistnav.push({
                    li: [{
                        a: [{
                            _attr: {
                                href: `${path.relative(basePath, page.xhtmlPath)}`,
                            }
                        }, `${pagecnt}`],
                    }],
                });
            }
            tocnav.push({
                li: [{
                    a: [{
                        _attr: {
                            href: path.relative(basePath, chapter.pages[0].xhtmlPath),
                        }
                    }, chapter.name],
                }],
            });
        }

        const navXHTML = {
            html: [{
                _attr: {
                    xmlns: 'http://www.w3.org/1999/xhtml',
                    'xmlns:epub': 'http://www.idpf.org/2007/ops',
                    'xml:lang': this.meta.language,
                }
            }, {
                head: [{
                    title: 'Nav',
                }, {
                    meta: [{
                        _attr: {
                            charset: 'utf-8',
                        },
                    }],
                }],
            }, {
                body: [{
                    _attr: {
                        'epub:type': 'frontmatter',
                    },
                }, {
                    header: [{
                        h1: ['Table of Contents']
                    }],
                }, {
                    nav: [{
                        _attr: {
                            'epub:type': 'toc',
                            id: 'toc',
                        },
                    }, {
                        ol: tocnav,
                    }],
                }, {
                    nav: [{
                        _attr: {
                            'epub:type': 'page-list',
                        },
                    }, {
                        ol: pagelistnav,
                    }],
                }],
            }],
        };
        return xml(navXHTML, {
            declaration: {
                encoding: 'utf-8',
                standalone: 'no'
            }
        })
    }

    async finalize() {
        // Write ePub metadata & pages to the zip
        // Container
        this.archive.append(this.getContainer(), {
            name: 'META-INF/container.xml',
        });

        // content.opf
        this.archive.append(this.getOpf(), {
            name: path.join(basePath, 'content.opf'),
        });

        // Nav
        this.archive.append(await this.getNav(), {
            name: path.join(basePath, 'nav.xhtml'),
        });
        this.archive.append(this.getNcx(), {
            name: path.join(basePath, 'toc.ncx'),
        });

        // Css
        this.archive.append(await fs.readFile('./assets/main.css'), {
            name: path.join(cssBasePath, 'main.css'),
        });

        this.archive.finalize();
    }

    pipe(stream: Writable) {
        this.archive.pipe(stream);
    }
}