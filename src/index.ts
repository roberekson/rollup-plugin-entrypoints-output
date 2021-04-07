import { OutputOptions, InternalModuleFormat, InputOptions, InputOption, Plugin } from 'rollup/dist/rollup';

const sriToolbox = require('sri-toolbox');
const fs = require('fs');

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
    entrypoints: Record<string, EntrypointFileTypes>;
    integrity?: Record<string, string>;
}

interface ModuleOptions {
    outFile: string,
    rootDir?: string,
    integrityHash?: boolean,
    modifyFile?: boolean,
}

const defaultOptions: ModuleOptions = {
    outFile: '',
    integrityHash: false,
    modifyFile: false,
};

const entrypoints = new Map;
let outFile = '';
let json: Entrypoint;
let hashes: Record<string, string> = {};

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
    if (Array.isArray(filepath)) {
        [filepath] = filepath;
    }

    const matches = (<string>filepath).match(/([a-z0-9-]+)\.ts/i);
    return (matches[1].length ? matches[1] : filepath) as string;
}

const createWriteBundle = (moduleOptions: ModuleOptions) => (options: OutputOptions, bundle): void => {
    let bundleName = '';

    try {
        if (moduleOptions.modifyFile && fs.existsSync(moduleOptions.outFile)) {
            json = jsonfile.readFileSync(moduleOptions.outFile);
        }
    } catch (err) {
        console.log(err);
    }

    if (typeof json === 'undefined' || typeof json.entrypoints === 'undefined') {
        json = {
            entrypoints: {},
        };
    }

    if (moduleOptions.integrityHash) {
        if (typeof json.integrity === 'undefined') {
            json.integrity = {};
        } else {
            hashes = json.integrity;
        }
    }

    const hashKeys = Object.keys(hashes);

    for (const filepath in bundle) {
        const type = getFileType(filepath);
        const rootDir = moduleOptions.rootDir || options.dir;

        if (bundle[filepath].isEntry) {
            bundleName = bundle[filepath].name;
        }

        if (type !== FileType.map) {
            if (typeof json.entrypoints[bundleName] === 'undefined') {
                json.entrypoints[bundleName] = {};
            }

            const relPath = `${rootDir}/${filepath}`;
            const file = (moduleOptions.integrityHash && bundle[filepath].isEntry) ? `${options.dir}/${filepath}` : `${options.dir}/${bundle[filepath].fileName}`;

            const fileParsed = path.parse(file);
            const fileNameSplit = fileParsed.base.split('.');
            const fileExt = fileParsed.ext;

            for (let i = 0; i < hashKeys.length; i += 1) {
                const key = hashKeys[i];
                const parseInfo = path.parse(key);
                const splitInfo = parseInfo.base.split('.');
                if (
                    (parseInfo.ext === fileExt && fileExt === '.js' && splitInfo[0] === fileNameSplit[0] && splitInfo[1] === fileNameSplit[1]) ||
                    (parseInfo.ext === fileExt && fileExt === '.css' && splitInfo[0] === fileNameSplit[0])
                ) {
                    delete hashes[key];
                    break;
                }
            };

            hashes[relPath] = sriToolbox.generate({ algorithms: ['sha512'] }, fs.readFileSync(file));

            if (isJavaScriptEntrypoint(filepath)) {
                if (typeof json.entrypoints[bundleName]['js'] === 'undefined') {
                    json.entrypoints[bundleName][FileType.js] = {};
                }

                json.entrypoints[bundleName][FileType.js][options.format] = new Set();
                json.entrypoints[bundleName][type][options.format].add(relPath);
            } else {
                json.entrypoints[bundleName][FileType.css] = new Set();
                json.entrypoints[bundleName][FileType.css].add(relPath);
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
