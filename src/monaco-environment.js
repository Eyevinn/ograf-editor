// Monaco web-worker wiring for Vite.
//
// Without this, Monaco has no way to spawn its language workers and every
// language service (JSON validation, folding, color, sticky scroll) throws
// "Unexpected usage" from _EditorSimpleWorker.loadForeignModule. Vite's
// `?worker` suffix bundles each worker as a module Worker, and we hand Monaco
// the right one per language label via MonacoEnvironment.getWorker.
//
// Import this module once, before Monaco is loaded.

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
    getWorker(_workerId, label) {
        switch (label) {
            case 'json':
                return new jsonWorker();
            case 'css':
            case 'scss':
            case 'less':
                return new cssWorker();
            case 'html':
            case 'handlebars':
            case 'razor':
                return new htmlWorker();
            case 'typescript':
            case 'javascript':
                return new tsWorker();
            default:
                return new editorWorker();
        }
    }
};
