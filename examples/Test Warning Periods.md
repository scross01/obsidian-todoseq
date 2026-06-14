
Warning period examples using -Nd syntax for controlling task visibility.

## Deadline Advance Notice

TODO Write quarterly report
DEADLINE: <2027-03-31 Mon -7d>

TODO File taxes
DEADLINE: <2027-04-15 Wed -14d>

TODO Buy groceries
DEADLINE: <2027-01-10 Sat -1d>

## Scheduled Delayed Notice

TODO Start project planning
SCHEDULED: <2027-01-05 Mon -3d>

TODO Review PR
SCHEDULED: <2027-01-08 Thu -1d>

## Combined: Deadline + Scheduled with Warning Periods

TODO Prepare presentation
SCHEDULED: <2027-01-10 Sat>
DEADLINE: <2027-01-20 Tue -5d>

TODO Urgent report
DEADLINE: <2027-01-15 Wed -7d>

## Warning Period with Repeater

TODO Weekly review
SCHEDULED: <2027-01-06 Tue +1w -2d>

TODO Monthly report
DEADLINE: <2027-01-31 Sun +1m -5d>

## First-Only Warning Period (--Nd)

TODO Initial setup
SCHEDULED: <2027-01-13 Mon +1w --3d>

## In Quote Blocks

> TODO Quoted task with warning
> DEADLINE: <2027-02-14 Sat -3d>

---

```todoseq
search: file:"Test Warning Periods"
show-future: show-all
show-deadline-date: show
```
