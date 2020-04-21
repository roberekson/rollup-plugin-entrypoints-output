import { OutputOptions, InternalModuleFormat, InputOptions, InputOption, Plugin } from 'rollup/dist/rollup';

const crypto = require('crypto');

const jsonfile = require('jsonfile');
const path = require('path');

type EntrypointUrl = string;
type EntrypointCssUrl = EntrypointUrl;
type EntrypointJavascriptUrl = EntrypointUrl;

enum FileType {
    css = 'css',
    js = 'js',
    map = 'map',
    other = 'other',
};

type EntrypointJavaScriptFormats = InternalModuleFormat;

// TODO: Improve typing on key
type EntrypointJavaScript = {
    [key: string]: Set<EntrypointJavascriptUrl>;
}
// type EntrypointJavaScript = <EntrypointJavaScriptFormats, Set<EntrypointJavascriptUrl>>;

interface EntrypointFileTypes {
    js?: EntrypointJavaScript;
    css?: Set<EntrypointCssUrl>;
    other?: Record<string, string>;
}

interface Entrypoint {
    [key: string]: EntrypointFileTypes | any;
}

interface ModuleOptions {
    outFile: string,
    rootDir?: string,
    integrityHash?: boolean,
}

const defaultOptions: ModuleOptions = {
    outFile: '',
    integrityHash: false,
};

const entrypoints = new Map;
let outFile = '';
let json: Entrypoint;
const hashes: Record<string, string> = {};

const createBuildStart = (moduleOptions: ModuleOptions) => (options: InputOptions) => {
    if (!outFile.length) {
        outFile = path.resolve(process.cwd(), moduleOptions.outFile);
    }

    entrypoints.set(options.input, {
        name: getEntrypointName(options.input),
        files: {
            js: {},
            css: [],
        }
    });
};

const getEntrypointName = (filepath: InputOption): string => {
    const matches = (<string>filepath).match(/([a-z0-9-]+)\.ts/i);
    return (matches[1].length ? matches[1] : filepath) as string;
}

const createWriteBundle = (moduleOptions: ModuleOptions) => (options: OutputOptions, bundle): void => {
    let bundleName = '';

    if (typeof json === 'undefined') {
        json = {};
    }
    
    for (const filepath in bundle) {
        const type = getFileType(filepath);
        const rootDir = moduleOptions.rootDir || options.dir;

        if (bundle[filepath].isEntry) {
            bundleName = bundle[filepath].name;
        }

        if (type !== FileType.map) {
            if (typeof json[bundleName] === 'undefined') {
                json[bundleName] = {};
            }

            const relPath = `${rootDir}/${filepath}`;

            if (moduleOptions.integrityHash && bundle[filepath].isEntry) {
                hashes[relPath] = `sha384-${crypto.createHash('sha384').update(bundle[filepath].code).digest('base64')}`;
            } else {
                hashes[relPath] = `sha384-${crypto.createHash('sha384').update(bundle[filepath].source).digest('base64')}`;
            }

            if (isJavaScriptEntrypoint(filepath)) {
                if (typeof json[bundleName]['js'] === 'undefined') {
                    json[bundleName][FileType.js] = {};
                }

                if (typeof json[bundleName][FileType.js][options.format] === 'undefined') {
                    json[bundleName][FileType.js][options.format] = new Set;
                }

                json[bundleName][type][options.format].add(relPath);
            } else {
                if (typeof json[bundleName][type] === 'undefined') {
                    json[bundleName][FileType.css] = new Set;
                }

                json[bundleName][FileType.css].add(relPath);
            }
        }
    }

    if (moduleOptions.integrityHash) {
        json.integrity = hashes;
    }

    jsonfile.writeFileSync(moduleOptions.outFile, json, {
        spaces: 2,
        replacer: jsonReplacer,
     });
}

const isJavaScriptEntrypoint = (entrypoint: EntrypointUrl): entrypoint is EntrypointJavascriptUrl => {
    const type = getFileType(entrypoint);

    if (type === FileType.js) {
        return true;
    }
    return false;
}

const jsonReplacer = <T>(key: string, value: T): T | string[] => {
    if (typeof value === 'object' && value instanceof Set) {
        return Array.from(value);
    }
    return value;
}

const isFileType = (type: FileType): type is FileType => {
    return type in FileType;
}

const getFileType = (filepath: string): FileType => {
    const ext = path.parse(filepath)['ext'].slice(1);
    
    if (isFileType(ext)) {
        return FileType[ext];
    } else {
        return FileType.other;
    }
}

export default (options: ModuleOptions = defaultOptions): Plugin => {
    const moduleOptions: ModuleOptions = {
        ...defaultOptions,
        ...options,
    };

    return {
        name: 'entrypoints-output',
        buildStart: createBuildStart(moduleOptions),
        writeBundle: createWriteBundle(moduleOptions),
    }
}
