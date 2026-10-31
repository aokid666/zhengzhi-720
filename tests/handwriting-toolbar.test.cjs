const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

function environment(viewport=true){
 const listeners=new Map(),frames=new Map();let next=0,disconnected=0;
 const target=prefix=>({addEventListener(k,f){listeners.set(prefix+k,f);},removeEventListener(k,f){if(listeners.get(prefix+k)===f)listeners.delete(prefix+k);}});
 const vv=Object.assign(target('v:'),{width:1024,height:768,offsetLeft:0,offsetTop:0,scale:1});
 const window={...target('w:'),requestAnimationFrame(f){frames.set(++next,f);return next;},cancelAnimationFrame(id){frames.delete(id);}};
 if(viewport)window.visualViewport=vv;
 const document={addEventListener(){}},ResizeObserver=class{constructor(f){this.notify=f;}observe(){}disconnect(){disconnected++;}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../js/annotate.js','utf8'),{window,document,ResizeObserver,localStorage:{getItem(){return null;}},console});
 const classes=new Set(),bar={offsetHeight:100,classList:{add(...xs){xs.forEach(x=>classes.add(x));},remove(...xs){xs.forEach(x=>classes.delete(x));}},style:{removeProperty(k){delete this[{'max-height':'maxHeight'}[k]||k];}}};
 return {window,vv,bar,classes,listeners,frames,disconnected:()=>disconnected,render(){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(f=>f());}};
}
test('handwriting palette remains at the visible screen bottom after pinch zoom, pan and keyboard resize',()=>{
 const e=environment(),release=e.window.ANNO.dockToolbar(e.bar);
 assert.equal(e.bar.style.width,'1024px');assert.equal(e.bar.style.transform,'translate(0px,668px) scale(1)');
 Object.assign(e.vv,{scale:4,width:256,height:192,offsetLeft:310,offsetTop:220});
 e.listeners.get('v:resize')();e.listeners.get('v:scroll')();assert.equal(e.frames.size,1,'pan and zoom in one frame must not queue redundant layouts');e.render();
 assert.equal(e.bar.style.width,'1024px');assert.equal(e.bar.style.transform,'translate(310px,387px) scale(0.25)');
 // After scaling: visible bounds x=310..566, y=220..412. Palette is y=387..412.
 Object.assign(e.vv,{width:300,height:100,offsetLeft:500,offsetTop:350});e.listeners.get('v:resize')();e.render();
 assert.equal(e.bar.style.width,'1200px');assert.equal(e.bar.style.transform,'translate(500px,425px) scale(0.25)');assert.equal(e.bar.style.maxHeight,'200px');
 e.listeners.get('w:scroll')();release();assert.equal(e.frames.size,0);assert.equal(e.listeners.size,0);assert.equal(e.classes.size,0);assert.equal(e.bar.style.transform,undefined);
});
test('without VisualViewport the palette retains CSS screen-bottom fallback and cleans up on repeated opens',()=>{
 const e=environment(false);for(let i=0;i<3;i++){const release=e.window.ANNO.dockToolbar(e.bar);assert(e.classes.has('screen-docked'));assert(!e.classes.has('visual-docked'));assert.equal(e.bar.style.transform,undefined);release();}
 assert.equal(e.listeners.size,0);assert.equal(e.frames.size,0);
 const css=fs.readFileSync(__dirname+'/../css/app.css','utf8');assert.match(css,/#annobar,#drawTools\.screen-docked\{[^}]*position:fixed;[^}]*bottom:0/);assert.match(css,/env\(safe-area-inset-bottom\)/);
});
