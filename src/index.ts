const jsonfile = require('jsonfile');
const path = require('path');

interface ModuleOptions {
    outFile: string,
}

const defaultOptions: ModuleOptions = {
    outFile: '',
};

enum FileType {
    css = 'css',
    js = 'js',
    map = 'map',
    other = 'other',
};

const entrypoints = new Map;
let outFile = '';
let json: Record<string, any>;

const createBuildStart = (moduleOptions: ModuleOptions) => (options) => {
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

const getEntrypointName = (filepath: string): string => {
    const matches = filepath.match(/([a-z0-9-]+)\.ts/i);
    return matches[1].length ? matches[1] : filepath;
}

const createWriteBundle = (moduleOptions: ModuleOptions) => (options: Record<string, any>, bundle): void => {
    let bundleName = '';

    if (typeof json === 'undefined') {
        json = {};
    }

    for (const filepath in bundle) {
        const type = getFileType(filepath);

        if (bundle[filepath].isEntry) {
            bundleName = bundle[filepath].name;
        }

        if (type !== FileType.map) {
            if (typeof json[bundleName] === 'undefined') {
                json[bundleName] = {};
            }

            if (type === FileType.js) {
                if (typeof json[bundleName][type] === 'undefined') {
                    json[bundleName][type] = {};
                }

                if (typeof json[bundleName][type][options.format] === 'undefined') {
                    json[bundleName][type][options.format] = new Set;
                }

                json[bundleName][type][options.format].add(`${options.dir}/${filepath}`);

            } else {
                if (typeof json[bundleName][type] === 'undefined') {
                    json[bundleName][type] = new Set;
                }

                json[bundleName][type].add(`${options.dir}/${filepath}`);
            }
        }
    }

    jsonfile.writeFileSync(moduleOptions.outFile, json, {
        spaces: 2,
        replacer: jsonReplacer,
     });
}

const jsonReplacer = (key, value) => {
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

export default (options = {}) => {
    const moduleOptions = {
        ...defaultOptions,
        ...options,
    };

    return {
        name: 'entrypoints-output',
        buildStart: createBuildStart(moduleOptions),
        writeBundle: createWriteBundle(moduleOptions),
    }
}
