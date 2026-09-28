from .normalize import customer_name
from .pricing import tier

def summarize(lines):
    totals = {}
    for line in lines:
        parts = line.rstrip('\r\n').split('\t')
        if len(parts) != 4:
            continue
        name = customer_name(parts[0])
        if not name or not parts[1].strip():
            continue
        try:
            quantity, cents = int(parts[2]), int(parts[3])
        except ValueError:
            continue
        if quantity <= 0 or cents < 0:
            continue
        count, total = totals.get(name, (0, 0))
        totals[name] = (count + quantity, total + quantity * cents)
    return [f'{name}\t{count}\t{total}\t{tier(total)}' for name, (count, total) in totals.items()]
