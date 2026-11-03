const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=__dirname;
function dimensions(buffer){assert.deepEqual([...buffer.subarray(0,8)],[137,80,78,71,13,10,26,10]);return [buffer.readUInt32BE(16),buffer.readUInt32BE(20)]}
test('manifest supplies real Android PNG sizes and a separate maskable icon',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
 for(const [purpose,size] of [['any',192],['any',512],['maskable',512]]){
  const entry=manifest.icons.find(x=>x.purpose===purpose&&x.sizes===`${size}x${size}`);assert.ok(entry);assert.equal(entry.type,'image/png');
  const file=path.join(root,entry.src);assert.deepEqual(dimensions(fs.readFileSync(file)),[size,size]);
 }
 assert.equal(manifest.theme_color,'#101114');assert.equal(manifest.background_color,'#101114');
});
test('Apple touch icon and favicon are exported and linked at the required sizes',()=>{
 const html=fs.readFileSync(path.join(root,'source/app.html'),'utf8');
 assert.match(html,/<link rel="apple-touch-icon" sizes="180x180" href="\.\/icons\/apple-touch-icon\.png\?v=3">/);
 assert.match(html,/<link rel="icon" type="image\/png" sizes="32x32" href="\.\/icons\/favicon-32\.png\?v=3">/);
 for(const [file,size] of [['icons/apple-touch-icon.png',180],['apple-touch-icon.png',180],['icons/favicon-32.png',32]]){
  const input=fs.readFileSync(path.join(root,file));assert.deepEqual(dimensions(input),[size,size]);
 }
 assert.deepEqual(fs.readFileSync(path.join(root,'apple-touch-icon.png')),fs.readFileSync(path.join(root,'icons/apple-touch-icon.png')));
});
