"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.execute = exports.run3 = exports.DeclarationResolver = exports.FSProvider = exports.RECIPE_PATH = void 0;
const fs = require("fs");
const path = require("path");
const fancyLog = require("fancy-log");
const ansiColors = require("ansi-colors");
const dtsv = '3';
const tsfmt = require('../../tsfmt.json');
const SRC = path.join(__dirname, '../../src');
exports.RECIPE_PATH = path.join(__dirname, '../monaco/monaco.d.ts.recipe');
const DECLARATION_PATH = path.join(__dirname, '../../src/vs/monaco.d.ts');
function logErr(message, ...rest) {
    fancyLog(ansiColors.yellow(`[monaco.d.ts]`), message, ...rest);
}
function isDeclaration(ts, a) {
    return (a.kind === ts.SyntaxKind.InterfaceDeclaration
        || a.kind === ts.SyntaxKind.EnumDeclaration
        || a.kind === ts.SyntaxKind.ClassDeclaration
        || a.kind === ts.SyntaxKind.TypeAliasDeclaration
        || a.kind === ts.SyntaxKind.FunctionDeclaration
        || a.kind === ts.SyntaxKind.ModuleDeclaration);
}
function visitTopLevelDeclarations(ts, sourceFile, visitor) {
    let stop = false;
    const visit = (node) => {
        if (stop) {
            return;
        }
        switch (node.kind) {
            case ts.SyntaxKind.InterfaceDeclaration:
            case ts.SyntaxKind.EnumDeclaration:
            case ts.SyntaxKind.ClassDeclaration:
            case ts.SyntaxKind.VariableStatement:
            case ts.SyntaxKind.TypeAliasDeclaration:
            case ts.SyntaxKind.FunctionDeclaration:
            case ts.SyntaxKind.ModuleDeclaration:
                stop = visitor(node);
        }
        if (stop) {
            return;
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
}
function getAllTopLevelDeclarations(ts, sourceFile) {
    const all = [];
    visitTopLevelDeclarations(ts, sourceFile, (node) => {
        if (node.kind === ts.SyntaxKind.InterfaceDeclaration || node.kind === ts.SyntaxKind.ClassDeclaration || node.kind === ts.SyntaxKind.ModuleDeclaration) {
            const interfaceDeclaration = node;
            const triviaStart = interfaceDeclaration.pos;
            const triviaEnd = interfaceDeclaration.name.pos;
            const triviaText = getNodeText(sourceFile, { pos: triviaStart, end: triviaEnd });
            if (triviaText.indexOf('@internal') === -1) {
                all.push(node);
            }
        }
        else {
            const nodeText = getNodeText(sourceFile, node);
            if (nodeText.indexOf('@internal') === -1) {
                all.push(node);
            }
        }
        return false /*continue*/;
    });
    return all;
}
function getTopLevelDeclaration(ts, sourceFile, typeName) {
    let result = null;
    visitTopLevelDeclarations(ts, sourceFile, (node) => {
        if (isDeclaration(ts, node) && node.name) {
            if (node.name.text === typeName) {
                result = node;
                return true /*stop*/;
            }
            return false /*continue*/;
        }
        // node is ts.VariableStatement
        if (getNodeText(sourceFile, node).indexOf(typeName) >= 0) {
            result = node;
            return true /*stop*/;
        }
        return false /*continue*/;
    });
    return result;
}
function getNodeText(sourceFile, node) {
    return sourceFile.getFullText().substring(node.pos, node.end);
}
function hasModifier(modifiers, kind) {
    if (modifiers) {
        for (let i = 0; i < modifiers.length; i++) {
            const mod = modifiers[i];
            if (mod.kind === kind) {
                return true;
            }
        }
    }
    return false;
}
function isStatic(ts, member) {
    if (ts.canHaveModifiers(member)) {
        return hasModifier(ts.getModifiers(member), ts.SyntaxKind.StaticKeyword);
    }
    return false;
}
function isDefaultExport(ts, declaration) {
    return (hasModifier(declaration.modifiers, ts.SyntaxKind.DefaultKeyword)
        && hasModifier(declaration.modifiers, ts.SyntaxKind.ExportKeyword));
}
function getMassagedTopLevelDeclarationText(ts, sourceFile, declaration, importName, usage, enums) {
    let result = getNodeText(sourceFile, declaration);
    if (declaration.kind === ts.SyntaxKind.InterfaceDeclaration || declaration.kind === ts.SyntaxKind.ClassDeclaration) {
        const interfaceDeclaration = declaration;
        const staticTypeName = (isDefaultExport(ts, interfaceDeclaration)
            ? `${importName}.default`
            : `${importName}.${declaration.name.text}`);
        let instanceTypeName = staticTypeName;
        const typeParametersCnt = (interfaceDeclaration.typeParameters ? interfaceDeclaration.typeParameters.length : 0);
        if (typeParametersCnt > 0) {
            const arr = [];
            for (let i = 0; i < typeParametersCnt; i++) {
                arr.push('any');
            }
            instanceTypeName = `${instanceTypeName}<${arr.join(',')}>`;
        }
        const members = interfaceDeclaration.members;
        members.forEach((member) => {
            try {
                const memberText = getNodeText(sourceFile, member);
                if (memberText.indexOf('@internal') >= 0 || memberText.indexOf('private') >= 0) {
                    result = result.replace(memberText, '');
                }
                else {
                    const memberName = member.name.text;
                    const memberAccess = (memberName.indexOf('.') >= 0 ? `['${memberName}']` : `.${memberName}`);
                    if (isStatic(ts, member)) {
                        usage.push(`a = ${staticTypeName}${memberAccess};`);
                    }
                    else {
                        usage.push(`a = (<${instanceTypeName}>b)${memberAccess};`);
                    }
                }
            }
            catch (err) {
                // life..
            }
        });
    }
    result = result.replace(/export default /g, 'export ');
    result = result.replace(/export declare /g, 'export ');
    result = result.replace(/declare /g, '');
    const lines = result.split(/\r\n|\r|\n/);
    for (let i = 0; i < lines.length; i++) {
        if (/\s*\*/.test(lines[i])) {
            // very likely a comment
            continue;
        }
        lines[i] = lines[i].replace(/"/g, '\'');
    }
    result = lines.join('\n');
    if (declaration.kind === ts.SyntaxKind.EnumDeclaration) {
        result = result.replace(/const enum/, 'enum');
        enums.push({
            enumName: declaration.name.getText(sourceFile),
            text: result
        });
    }
    return result;
}
function format(ts, text, endl) {
    const REALLY_FORMAT = false;
    text = preformat(text, endl);
    if (!REALLY_FORMAT) {
        return text;
    }
    // Parse the source text
    const sourceFile = ts.createSourceFile('file.ts', text, ts.ScriptTarget.Latest, /*setParentPointers*/ true);
    // Get the formatting edits on the input sources
    const edits = ts.formatting.formatDocument(sourceFile, getRuleProvider(tsfmt), tsfmt);
    // Apply the edits on the input code
    return applyEdits(text, edits);
    function countParensCurly(text) {
        let cnt = 0;
        for (let i = 0; i < text.length; i++) {
            if (text.charAt(i) === '(' || text.charAt(i) === '{') {
                cnt++;
            }
            if (text.charAt(i) === ')' || text.charAt(i) === '}') {
                cnt--;
            }
        }
        return cnt;
    }
    function repeatStr(s, cnt) {
        let r = '';
        for (let i = 0; i < cnt; i++) {
            r += s;
        }
        return r;
    }
    function preformat(text, endl) {
        const lines = text.split(endl);
        let inComment = false;
        let inCommentDeltaIndent = 0;
        let indent = 0;
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].replace(/\s$/, '');
            let repeat = false;
            let lineIndent = 0;
            do {
                repeat = false;
                if (line.substring(0, 4) === '    ') {
                    line = line.substring(4);
                    lineIndent++;
                    repeat = true;
                }
                if (line.charAt(0) === '\t') {
                    line = line.substring(1);
                    lineIndent++;
                    repeat = true;
                }
            } while (repeat);
            if (line.length === 0) {
                continue;
            }
            if (inComment) {
                if (/\*\//.test(line)) {
                    inComment = false;
                }
                lines[i] = repeatStr('\t', lineIndent + inCommentDeltaIndent) + line;
                continue;
            }
            if (/\/\*/.test(line)) {
                inComment = true;
                inCommentDeltaIndent = indent - lineIndent;
                lines[i] = repeatStr('\t', indent) + line;
                continue;
            }
            const cnt = countParensCurly(line);
            let shouldUnindentAfter = false;
            let shouldUnindentBefore = false;
            if (cnt < 0) {
                if (/[({]/.test(line)) {
                    shouldUnindentAfter = true;
                }
                else {
                    shouldUnindentBefore = true;
                }
            }
            else if (cnt === 0) {
                shouldUnindentBefore = /^\}/.test(line);
            }
            let shouldIndentAfter = false;
            if (cnt > 0) {
                shouldIndentAfter = true;
            }
            else if (cnt === 0) {
                shouldIndentAfter = /{$/.test(line);
            }
            if (shouldUnindentBefore) {
                indent--;
            }
            lines[i] = repeatStr('\t', indent) + line;
            if (shouldUnindentAfter) {
                indent--;
            }
            if (shouldIndentAfter) {
                indent++;
            }
        }
        return lines.join(endl);
    }
    function getRuleProvider(options) {
        // Share this between multiple formatters using the same options.
        // This represents the bulk of the space the formatter uses.
        return ts.formatting.getFormatContext(options);
    }
    function applyEdits(text, edits) {
        // Apply edits in reverse on the existing text
        let result = text;
        for (let i = edits.length - 1; i >= 0; i--) {
            const change = edits[i];
            const head = result.slice(0, change.span.start);
            const tail = result.slice(change.span.start + change.span.length);
            result = head + change.newText + tail;
        }
        return result;
    }
}
function createReplacerFromDirectives(directives) {
    return (str) => {
        for (let i = 0; i < directives.length; i++) {
            str = str.replace(directives[i][0], directives[i][1]);
        }
        return str;
    };
}
function createReplacer(data) {
    data = data || '';
    const rawDirectives = data.split(';');
    const directives = [];
    rawDirectives.forEach((rawDirective) => {
        if (rawDirective.length === 0) {
            return;
        }
        const pieces = rawDirective.split('=>');
        let findStr = pieces[0];
        const replaceStr = pieces[1];
        findStr = findStr.replace(/[\-\\\{\}\*\+\?\|\^\$\.\,\[\]\(\)\#\s]/g, '\\$&');
        findStr = '\\b' + findStr + '\\b';
        directives.push([new RegExp(findStr, 'g'), replaceStr]);
    });
    return createReplacerFromDirectives(directives);
}
function generateDeclarationFile(ts, recipe, sourceFileGetter) {
    const endl = /\r\n/.test(recipe) ? '\r\n' : '\n';
    const lines = recipe.split(endl);
    const result = [];
    let usageCounter = 0;
    const usageImports = [];
    const usage = [];
    let failed = false;
    usage.push(`var a: any;`);
    usage.push(`var b: any;`);
    const generateUsageImport = (moduleId) => {
        const importName = 'm' + (++usageCounter);
        usageImports.push(`import * as ${importName} from './${moduleId.replace(/\.d\.ts$/, '')}';`);
        return importName;
    };
    const enums = [];
    let version = null;
    lines.forEach(line => {
        if (failed) {
            return;
        }
        const m0 = line.match(/^\/\/dtsv=(\d+)$/);
        if (m0) {
            version = m0[1];
        }
        const m1 = line.match(/^\s*#include\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
        if (m1) {
            const moduleId = m1[1];
            const sourceFile = sourceFileGetter(moduleId);
            if (!sourceFile) {
                logErr(`While handling ${line}`);
                logErr(`Cannot find ${moduleId}`);
                failed = true;
                return;
            }
            const importName = generateUsageImport(moduleId);
            const replacer = createReplacer(m1[2]);
            const typeNames = m1[3].split(/,/);
            typeNames.forEach((typeName) => {
                typeName = typeName.trim();
                if (typeName.length === 0) {
                    return;
                }
                const declaration = getTopLevelDeclaration(ts, sourceFile, typeName);
                if (!declaration) {
                    logErr(`While handling ${line}`);
                    logErr(`Cannot find ${typeName}`);
                    failed = true;
                    return;
                }
                result.push(replacer(getMassagedTopLevelDeclarationText(ts, sourceFile, declaration, importName, usage, enums)));
            });
            return;
        }
        const m2 = line.match(/^\s*#includeAll\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
        if (m2) {
            const moduleId = m2[1];
            const sourceFile = sourceFileGetter(moduleId);
            if (!sourceFile) {
                logErr(`While handling ${line}`);
                logErr(`Cannot find ${moduleId}`);
                failed = true;
                return;
            }
            const importName = generateUsageImport(moduleId);
            const replacer = createReplacer(m2[2]);
            const typeNames = m2[3].split(/,/);
            const typesToExcludeMap = {};
            const typesToExcludeArr = [];
            typeNames.forEach((typeName) => {
                typeName = typeName.trim();
                if (typeName.length === 0) {
                    return;
                }
                typesToExcludeMap[typeName] = true;
                typesToExcludeArr.push(typeName);
            });
            getAllTopLevelDeclarations(ts, sourceFile).forEach((declaration) => {
                if (isDeclaration(ts, declaration) && declaration.name) {
                    if (typesToExcludeMap[declaration.name.text]) {
                        return;
                    }
                }
                else {
                    // node is ts.VariableStatement
                    const nodeText = getNodeText(sourceFile, declaration);
                    for (let i = 0; i < typesToExcludeArr.length; i++) {
                        if (nodeText.indexOf(typesToExcludeArr[i]) >= 0) {
                            return;
                        }
                    }
                }
                result.push(replacer(getMassagedTopLevelDeclarationText(ts, sourceFile, declaration, importName, usage, enums)));
            });
            return;
        }
        result.push(line);
    });
    if (failed) {
        return null;
    }
    if (version !== dtsv) {
        if (!version) {
            logErr(`gulp watch restart required. 'monaco.d.ts.recipe' is written before versioning was introduced.`);
        }
        else {
            logErr(`gulp watch restart required. 'monaco.d.ts.recipe' v${version} does not match runtime v${dtsv}.`);
        }
        return null;
    }
    let resultTxt = result.join(endl);
    resultTxt = resultTxt.replace(/\bURI\b/g, 'Uri');
    resultTxt = resultTxt.replace(/\bEvent</g, 'IEvent<');
    resultTxt = resultTxt.split(/\r\n|\n|\r/).join(endl);
    resultTxt = format(ts, resultTxt, endl);
    resultTxt = resultTxt.split(/\r\n|\n|\r/).join(endl);
    enums.sort((e1, e2) => {
        if (e1.enumName < e2.enumName) {
            return -1;
        }
        if (e1.enumName > e2.enumName) {
            return 1;
        }
        return 0;
    });
    let resultEnums = [
        '/*---------------------------------------------------------------------------------------------',
        ' *  Copyright (c) Microsoft Corporation. All rights reserved.',
        ' *  Licensed under the MIT License. See License.txt in the project root for license information.',
        ' *--------------------------------------------------------------------------------------------*/',
        '',
        '// THIS IS A GENERATED FILE. DO NOT EDIT DIRECTLY.',
        ''
    ].concat(enums.map(e => e.text)).join(endl);
    resultEnums = resultEnums.split(/\r\n|\n|\r/).join(endl);
    resultEnums = format(ts, resultEnums, endl);
    resultEnums = resultEnums.split(/\r\n|\n|\r/).join(endl);
    return {
        result: resultTxt,
        usageContent: `${usageImports.join('\n')}\n\n${usage.join('\n')}`,
        enums: resultEnums
    };
}
function _run(ts, sourceFileGetter) {
    const recipe = fs.readFileSync(exports.RECIPE_PATH).toString();
    const t = generateDeclarationFile(ts, recipe, sourceFileGetter);
    if (!t) {
        return null;
    }
    const result = t.result;
    const usageContent = t.usageContent;
    const enums = t.enums;
    const currentContent = fs.readFileSync(DECLARATION_PATH).toString();
    const one = currentContent.replace(/\r\n/gm, '\n');
    const other = result.replace(/\r\n/gm, '\n');
    const isTheSame = (one === other);
    return {
        content: result,
        usageContent: usageContent,
        enums: enums,
        filePath: DECLARATION_PATH,
        isTheSame
    };
}
class FSProvider {
    existsSync(filePath) {
        return fs.existsSync(filePath);
    }
    statSync(filePath) {
        return fs.statSync(filePath);
    }
    readFileSync(_moduleId, filePath) {
        return fs.readFileSync(filePath);
    }
}
exports.FSProvider = FSProvider;
class CacheEntry {
    sourceFile;
    mtime;
    constructor(sourceFile, mtime) {
        this.sourceFile = sourceFile;
        this.mtime = mtime;
    }
}
class DeclarationResolver {
    _fsProvider;
    ts;
    _sourceFileCache;
    constructor(_fsProvider) {
        this._fsProvider = _fsProvider;
        this.ts = require('typescript');
        this._sourceFileCache = Object.create(null);
    }
    invalidateCache(moduleId) {
        this._sourceFileCache[moduleId] = null;
    }
    getDeclarationSourceFile(moduleId) {
        if (this._sourceFileCache[moduleId]) {
            // Since we cannot trust file watching to invalidate the cache, check also the mtime
            const fileName = this._getFileName(moduleId);
            const mtime = this._fsProvider.statSync(fileName).mtime.getTime();
            if (this._sourceFileCache[moduleId].mtime !== mtime) {
                this._sourceFileCache[moduleId] = null;
            }
        }
        if (!this._sourceFileCache[moduleId]) {
            this._sourceFileCache[moduleId] = this._getDeclarationSourceFile(moduleId);
        }
        return this._sourceFileCache[moduleId] ? this._sourceFileCache[moduleId].sourceFile : null;
    }
    _getFileName(moduleId) {
        if (/\.d\.ts$/.test(moduleId)) {
            return path.join(SRC, moduleId);
        }
        return path.join(SRC, `${moduleId}.ts`);
    }
    _getDeclarationSourceFile(moduleId) {
        const fileName = this._getFileName(moduleId);
        if (!this._fsProvider.existsSync(fileName)) {
            return null;
        }
        const mtime = this._fsProvider.statSync(fileName).mtime.getTime();
        if (/\.d\.ts$/.test(moduleId)) {
            // const mtime = this._fsProvider.statFileSync()
            const fileContents = this._fsProvider.readFileSync(moduleId, fileName).toString();
            return new CacheEntry(this.ts.createSourceFile(fileName, fileContents, this.ts.ScriptTarget.ES5), mtime);
        }
        const fileContents = this._fsProvider.readFileSync(moduleId, fileName).toString();
        const fileMap = {
            'file.ts': fileContents
        };
        const service = this.ts.createLanguageService(new TypeScriptLanguageServiceHost(this.ts, {}, fileMap, {}));
        const text = service.getEmitOutput('file.ts', true, true).outputFiles[0].text;
        return new CacheEntry(this.ts.createSourceFile(fileName, text, this.ts.ScriptTarget.ES5), mtime);
    }
}
exports.DeclarationResolver = DeclarationResolver;
function run3(resolver) {
    const sourceFileGetter = (moduleId) => resolver.getDeclarationSourceFile(moduleId);
    return _run(resolver.ts, sourceFileGetter);
}
exports.run3 = run3;
class TypeScriptLanguageServiceHost {
    _ts;
    _libs;
    _files;
    _compilerOptions;
    constructor(ts, libs, files, compilerOptions) {
        this._ts = ts;
        this._libs = libs;
        this._files = files;
        this._compilerOptions = compilerOptions;
    }
    // --- language service host ---------------
    getCompilationSettings() {
        return this._compilerOptions;
    }
    getScriptFileNames() {
        return ([]
            .concat(Object.keys(this._libs))
            .concat(Object.keys(this._files)));
    }
    getScriptVersion(_fileName) {
        return '1';
    }
    getProjectVersion() {
        return '1';
    }
    getScriptSnapshot(fileName) {
        if (this._files.hasOwnProperty(fileName)) {
            return this._ts.ScriptSnapshot.fromString(this._files[fileName]);
        }
        else if (this._libs.hasOwnProperty(fileName)) {
            return this._ts.ScriptSnapshot.fromString(this._libs[fileName]);
        }
        else {
            return this._ts.ScriptSnapshot.fromString('');
        }
    }
    getScriptKind(_fileName) {
        return this._ts.ScriptKind.TS;
    }
    getCurrentDirectory() {
        return '';
    }
    getDefaultLibFileName(_options) {
        return 'defaultLib:es5';
    }
    isDefaultLibFileName(fileName) {
        return fileName === this.getDefaultLibFileName(this._compilerOptions);
    }
    readFile(path, _encoding) {
        return this._files[path] || this._libs[path];
    }
    fileExists(path) {
        return path in this._files || path in this._libs;
    }
}
function execute() {
    const r = run3(new DeclarationResolver(new FSProvider()));
    if (!r) {
        throw new Error(`monaco.d.ts generation error - Cannot continue`);
    }
    return r;
}
exports.execute = execute;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9uYWNvLWFwaS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1vbmFjby1hcGkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcseUJBQXlCO0FBRXpCLDZCQUE2QjtBQUM3QixzQ0FBc0M7QUFDdEMsMENBQTBDO0FBRTFDLE1BQU0sSUFBSSxHQUFHLEdBQUcsQ0FBQztBQUVqQixNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsa0JBQWtCLENBQUMsQ0FBQztBQUUxQyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxXQUFXLENBQUMsQ0FBQztBQUNqQyxRQUFBLFdBQVcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSw4QkFBOEIsQ0FBQyxDQUFDO0FBQ2hGLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsMEJBQTBCLENBQUMsQ0FBQztBQUUxRSxTQUFTLE1BQU0sQ0FBQyxPQUFZLEVBQUUsR0FBRyxJQUFXO0lBQzNDLFFBQVEsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxFQUFFLE9BQU8sRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDO0FBQ2hFLENBQUM7QUFPRCxTQUFTLGFBQWEsQ0FBQyxFQUErQixFQUFFLENBQW9CO0lBQzNFLE9BQU8sQ0FDTixDQUFDLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsb0JBQW9CO1dBQzFDLENBQUMsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxlQUFlO1dBQ3hDLENBQUMsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0I7V0FDekMsQ0FBQyxDQUFDLElBQUksS0FBSyxFQUFFLENBQUMsVUFBVSxDQUFDLG9CQUFvQjtXQUM3QyxDQUFDLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsbUJBQW1CO1dB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