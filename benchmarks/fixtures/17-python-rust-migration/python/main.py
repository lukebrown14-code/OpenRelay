import sys
from orders.summary import summarize
for line in summarize(sys.stdin): print(line)
