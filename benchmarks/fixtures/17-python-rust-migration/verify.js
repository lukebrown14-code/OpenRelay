import {spawnSync} from 'node:child_process'
import {existsSync} from 'node:fs'
function check(ok,msg){if(!ok) throw Error(msg)}
const cases=[
 ` ada lovelace\twidget\t2\t2500\nADA  LOVELACE\tcable\t1\t5000\nbob\tcap\t1\t4999\n`,
 `alice\ta\t1\t5000\nalice\tb\t1\t4999\nalice\tc\t1\t1\n`,
 `zoe\ta\t0\t9000\nzoe\tb\t2\t-1\nzoe\tc\tbad\t2\nzoe\td\t1\t0\ninvalid\n`,
 `MIA\tx\t2\t2500\nlee\ty\t1\t9999\nmia\tz\t1\t0\n`
]
const known=[
 `Ada Lovelace\t3\t10000\tgold\nBob\t1\t4999\tbasic\n`,
 `Alice\t3\t10000\tgold\n`,
 `Zoe\t1\t0\tbasic\n`,
 `Mia\t3\t5000\tsilver\nLee\t1\t9999\tsilver\n`
]
const target='/tmp/openrelay-stage5-rust-'+process.pid
const rust=spawnSync('cargo',['build','--quiet','--offline','--manifest-path','rust/Cargo.toml'],{encoding:'utf8',timeout:60000,env:{...process.env,CARGO_TARGET_DIR:target}})
check(rust.status===0,'Rust build failed: '+rust.stderr)
const bin=target+'/debug/order-summary'
check(existsSync(bin),'Rust binary missing')
for(let i=0;i<cases.length;i++){
 const py=spawnSync('python3',['python/main.py'],{input:cases[i],encoding:'utf8',timeout:10000})
 check(py.status===0,'Python reference failed')
 check(py.stdout===known[i],'Python reference changed on case '+i)
 const result=spawnSync(bin,[],{input:cases[i],encoding:'utf8',timeout:10000})
 check(result.status===0,'Rust command failed on case '+i)
 check(result.stdout===py.stdout,'Rust differs from Python on case '+i+': '+JSON.stringify(result.stdout))
}
console.log('PASS: python-rust-migration')
