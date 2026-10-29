const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync(__dirname+'/../js/test-mode.js','utf8');
const questions={a:{id:'a',options:{A:'one',B:'two'},answer:'AB',multi:true},b:{id:'b',options:{A:'one',B:'two'},answer:'B'},m:{id:'m',type:'matching',left:[{key:'A'},{key:'B'}],right:[{key:'1'},{key:'2'}],matchMap:{A:['1'],B:['2']}}};
function storage(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};}
async function instance(session=storage(),progress=()=>null){
 const local=storage();local.setItem('zz720.testMode','1');const commits=[];
 const w={addEventListener(){}};const c={window:w,document:{getElementById:()=>null},sessionStorage:session,localStorage:local,ZS:{toast(){}},console};vm.runInNewContext(code,c);
 await w.TEST_MODE.init({getQ:id=>questions[id],sandbox:()=>false,progress,ensure:async()=>{},commit:(...args)=>commits.push(args),render(){},go(){}});return {api:w.TEST_MODE,commits,session};
}
test('answers remain ungraded drafts, edits replace rather than duplicate a question, and one settlement records the last choices',async()=>{
 const {api,commits}=await instance();api.prepare(questions.a);api.stage(questions.a,['A']);api.stage(questions.a,['B','A']);api.prepare(questions.b);api.stage(questions.b,['A']);assert.equal(api.count(),2);assert.equal(commits.length,0);api.finish(false);assert.equal(commits.length,2);assert.equal(commits[0][1],true);assert.equal(commits[1][1],false);assert.deepEqual(Array.from(api.result('a').sel),['B','A']);assert.deepEqual(Array.from(api.pool('a'),q=>q.id),['a','b']);assert.equal(api.finish(false),false);assert.equal(commits.length,2);
});
test('drafts survive a same-tab reload and already-settled work is not committed again',async()=>{
 const x=await instance();x.api.prepare(questions.a);x.api.stage(questions.a,['A','B']);const y=await instance(x.session);assert.equal(y.api.count(),1);assert.equal(y.commits.length,0);assert.deepEqual(Array.from(y.api.draft('a')),['A','B']);y.api.finish(false);assert.equal(y.commits.length,1);const z=await instance(x.session);assert.equal(z.commits.length,0);assert.equal(z.api.result('a').right,true);
});
test('only fully completed valid matching questions enter the score',async()=>{
 const {api,commits}=await instance();api.prepare(questions.m);api.stage(questions.m,['match:{"A":["1"]}']);assert.equal(api.count(),0);api.stage(questions.m,['match:{"A":["1"],"B":["99"]}']);assert.equal(api.count(),0);api.stage(questions.m,['match:{"A":["1"],"B":["2"]}']);assert.equal(api.count(),1);assert.equal(commits.length,0);api.finish(false);assert.equal(commits[0][1],true);
});
test('written answers and reveal-based clozes are not assigned invented automatic scores',async()=>{
 const {api}=await instance();assert.equal(api.eligible({id:'x',type:'written'}),false);assert.equal(api.eligible({id:'y',type:'cloze'}),false);
});

test('completed questions keep their graded status and never enter a new test draft',async()=>{
 const {api,commits}=await instance(storage(),id=>id==='a'?{s:'right',sel:['A','B'],tries:3}:null);assert.equal(api.prepare(questions.a),false);assert.equal(api.testing(questions.a),false);assert.equal(api.stage(questions.a,['B']),false);assert.equal(api.count(),0);assert.equal(commits.length,0);assert.equal(api.prepare(questions.b),true);api.stage(questions.b,['B']);assert.equal(api.count(),1);api.finish(false);assert.equal(commits.length,1);assert.equal(commits[0][0],'b');
});
