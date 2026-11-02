import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeSupport,requireSupportedRuntime} from '../host-plugin/runtime.mjs';
const sqlite={DatabaseSync:class {function(){}}};
test('minimum installation runtime rejects old versions and checks the required API without opening a database',()=>{
 for(const version of ['20.20.0','22.0.0','22.12.9','invalid'])assert.equal(runtimeSupport(version,sqlite).supported,false,version);
 for(const version of ['22.13.0','22.23.0','24.0.0'])assert.equal(runtimeSupport(version,sqlite).supported,true,version);
 assert.equal(runtimeSupport('23.0.0',{DatabaseSync:class{}}).supported,false);
 assert.equal(runtimeSupport('24.0.0',{}).supported,false);
 assert.equal(requireSupportedRuntime().supported,true);
});
