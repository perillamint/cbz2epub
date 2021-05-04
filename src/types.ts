export interface BookMeta {
    title: string,
    language: string,
    creator: string,
    contributor?: string | null,
    subject?: string | null,
    description?: string | null,
    publisher?: string | null,
    date?: Date | null,
    bookUUID?: string | null,
    identifier?: string | null,
    rights?: string | null,
    direction: 'ltr' | 'rtl' | 'default',
}

export interface Page {
    mime: string,
    path: string,
    xhtmlPath: string,
    id: string,
    xhtmlId: string,
}

export interface Chapter {
    name: string,
    pages: Page[],
}

export interface xmlEntry {
    [key: string]: string | xmlEntry | (xmlEntry | string)[],
}