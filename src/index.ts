import { EPubBuilder } from './epubbuilder';
import { orderBy } from 'natural-orderby';
import StreamZip from 'node-stream-zip';
import fs from 'fs';

async function main() {
    const ePubBuilder = new EPubBuilder({
        title: 'testbook',
        language: 'ko',
        creator: 'testauthor',
        direction: 'rtl',
    });
    const zip = new StreamZip.async({
        file: './test.cbz',
        storeEntries: true,
    });

    const stream = fs.createWriteStream('./foo.epub');
    ePubBuilder.pipe(stream);

    const entries = orderBy(Object.values(await zip.entries()), [
        (elem) => elem.name
    ], [
        'asc',
    ]);
    await ePubBuilder.addCover(await zip.entryData(entries[0].name));
    console.log('bar')
    const pages = entries.slice(1)
    await ePubBuilder.setChapterMeta(1, 'comic');
    for (const page of pages) {
        const name = page.name;
        const file = await zip.entryData(page.name);
        console.log(name);
        await ePubBuilder.addPage(1, file, name);
    }

    await ePubBuilder.finalize();
}

//cmdline support
const isRunningAsScript = require.main === module;
if (isRunningAsScript) {
    main().catch(console.error);
}
