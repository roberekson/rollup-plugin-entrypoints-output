/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */

var __assign = function() {
    __assign = Object.assign || function __assign(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};

var sriToolbox = require('sri-toolbox');
var fs = require('fs');
var jsonfile = require('jsonfile');
var path = require('path');
var FileType;
(function (FileType) {
    FileType["css"] = "css";
    FileType["js"] = "js";
    FileType["map"] = "map";
    FileType["other"] = "other";
})(FileType || (FileType = {}));
var defaultOptions = {
    outFile: '',
    integrityHash: false,
    modifyFile: false
};
var entrypoints = new Map;
var outFile = '';
var json;
var hashes = {};
var createBuildStart = function (moduleOptions) { return function (options) {
    if (!outFile.length) {
        outFile = path.resolve(process.cwd(), moduleOptions.outFile);
    }
    entrypoints.set(options.input, {
        name: getEntrypointName(options.input),
        files: {
            js: {},
            css: []
        }
    });
}; };
var getEntrypointName = function (filepath) {
    var matches = filepath.match(/([a-z0-9-]+)\.ts/i);
    return (matches[1].length ? matches[1] : filepath);
};
var createWriteBundle = function (moduleOptions) { return function (options, bundle) {
    var bundleName = '';
    try {
        if (moduleOptions.modifyFile && fs.existsSync(moduleOptions.outFile)) {
            json = jsonfile.readFileSync(moduleOptions.outFile);
        }
    }
    catch (err) {
        console.log(err);
    }
    if (typeof json === 'undefined' || typeof json.entrypoints === 'undefined') {
        json = {
            entrypoints: {}
        };
    }
    if (moduleOptions.integrityHash) {
        if (typeof json.integrity === 'undefined') {
            json.integrity = {};
        }
        else {
            hashes = json.integrity;
        }
    }
    var hashKeys = Object.keys(hashes);
    for (var filepath in bundle) {
        var type = getFileType(filepath);
        var rootDir = moduleOptions.rootDir || options.dir;
        if (bundle[filepath].isEntry) {
            bundleName = bundle[filepath].name;
        }
        if (type !== FileType.map) {
            if (typeof json.entrypoints[bundleName] === 'undefined') {
                json.entrypoints[bundleName] = {};
            }
            var relPath = rootDir + "/" + filepath;
            var file = (moduleOptions.integrityHash && bundle[filepath].isEntry) ? options.dir + "/" + filepath : options.dir + "/" + bundle[filepath].fileName;
            var fileParsed = path.parse(file);
            var fileNameSplit = fileParsed.base.split('.');
            var fileExt = fileParsed.ext;
            for (var i = 0; i < hashKeys.length; i += 1) {
                var key = hashKeys[i];
                var parseInfo = path.parse(key);
                var splitInfo = parseInfo.base.split('.');
                if ((parseInfo.ext === fileExt && fileExt === '.js' && splitInfo[0] === fileNameSplit[0] && splitInfo[1] === fileNameSplit[1]) ||
                    (parseInfo.ext === fileExt && fileExt === '.css' && splitInfo[0] === fileNameSplit[0])) {
                    delete hashes[key];
                    break;
                }
            }
            hashes[relPath] = sriToolbox.generate({ algorithms: ['sha512'] }, fs.readFileSync(file));
            if (isJavaScriptEntrypoint(filepath)) {
                if (typeof json.entrypoints[bundleName]['js'] === 'undefined') {
                    json.entrypoints[bundleName][FileType.js] = {};
                }
                json.entrypoints[bundleName][FileType.js][options.format] = new Set();
                json.entrypoints[bundleName][type][options.format].add(relPath);
            }
            else {
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
        replacer: jsonReplacer
    });
}; };
var isJavaScriptEntrypoint = function (entrypoint) {
    var type = getFileType(entrypoint);
    if (type === FileType.js) {
        return true;
    }
    return false;
};
var jsonReplacer = function (key, value) {
    if (typeof value === 'object' && value instanceof Set) {
        return Array.from(value);
    }
    return value;
};
var isFileType = function (type) {
    return type in FileType;
};
var getFileType = function (filepath) {
    var ext = path.parse(filepath)['ext'].slice(1);
    if (isFileType(ext)) {
        return FileType[ext];
    }
    else {
        return FileType.other;
    }
};
var index = (function (options) {
    if (options === void 0) { options = defaultOptions; }
    var moduleOptions = __assign(__assign({}, defaultOptions), options);
    return {
        name: 'entrypoints-output',
        buildStart: createBuildStart(moduleOptions),
        writeBundle: createWriteBundle(moduleOptions)
    };
});

export default index;
