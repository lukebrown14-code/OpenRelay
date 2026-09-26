use std::io::{self, Read};
fn normalize(raw: &str) -> String {
    raw.split_whitespace().map(|word| {
        let mut chars=word.chars();
        match chars.next() {Some(first)=>format!("{}{}", first.to_uppercase(), chars.as_str().to_lowercase()),None=>String::new()}
    }).collect::<Vec<_>>().join(" ")
}
fn main() {
    let mut input=String::new(); io::stdin().read_to_string(&mut input).unwrap();
    let mut rows:Vec<(String,i64,i64)>=Vec::new();
    for line in input.lines() {
        let parts:Vec<_>=line.trim_end_matches('\r').split('\t').collect();
        if parts.len()!=4 {continue}
        let name=normalize(parts[0]);
        if name.is_empty() || parts[1].trim().is_empty() {continue}
        let (Ok(quantity),Ok(cents))=(parts[2].parse::<i64>(),parts[3].parse::<i64>()) else {continue};
        if quantity<=0 || cents<0 {continue}
        if let Some(row)=rows.iter_mut().find(|row|row.0==name) {row.1+=quantity;row.2+=quantity*cents}
        else {rows.push((name,quantity,quantity*cents))}
    }
    for (name,count,total) in rows {
        let tier=if total>=10000 {"gold"} else if total>=5000 {"silver"} else {"basic"};
        println!("{name}\t{count}\t{total}\t{tier}");
    }
}
