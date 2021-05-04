import {BookMeta, Page, Chapter, xmlEntry} from './types';
import xml from 'xml';
import sizeOf from 'image-size';
import path from 'path';

export async function xhtmlBuilder(img: Buffer, imgpath: string, imgalt: string, csspath: string, meta: BookMeta): Promise<string> {
    const imgSz = sizeOf(img);
    const xhtmlTemplate: xmlEntry[] = [{
        html: [{
            _attr: {
                xmlns: 'http://www.w3.org/1999/xhtml',
                'xmlns:xml': 'http://www.w3.org/XML/1998/namespace',
                'xmlns:epub': 'http://www.idpf.org/2007/ops',
                'xml:lang': meta.language,
            }
        }, {
            head: [{
                title: meta.title,
            }, {
                link: [{
                    _attr: {
                        href: csspath,
                        rel: 'stylesheet',
                        type: 'text/css',
                    }
                }]
            }, {
                meta: [{
                    _attr: {
                        name: 'viewport',
                        content: `width=${imgSz.width}, height=${imgSz.height}`,
                    }
                }]
            }],
        }, {
            body: [{
                _attr: {
                    'epub:type': 'bodymatter',
                },
            }, {
                img: [{
                    _attr: {
                        src: imgpath,
                        alt: imgalt,
                    }
                }],
            }],
        }],
    }];

    return xml(xhtmlTemplate, {
        declaration: {
            encoding: 'utf-8',
        },
    });
}