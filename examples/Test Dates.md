
Examples of setting scheduled and deadline dates for tasks.

TODO scheduled with date 
SCHEDULED: <2027-01-01>

TODO scheduled with day
SCHEDULED: <2027-01-01 Mon>

TODO scheduled with date and time 
SCHEDULED: <2027-10-31 08:00> 

TODO scheduled with day and time
SCHEDULED: <2027-01-01 Mon 08:00>

TODO deadline with date
DEADLINE: <2027-01-01>

TODO deadline with day
DEADLINE: <2027-01-01 Mon>

TODO deadline with date and time
DEADLINE: <2027-01-01 08:00>

TODO deadline with day and time
DEADLINE: <2027-01-01 Mon 08:00>

TODO test which scheduled and deadline
SCHEDULED: <2027-01-01>
DEADLINE: <2027-01-31>

Setting dates within different block types.

> TODO test dates in quote block
> SCHEDULED: <2027-01-01>

>[!info]
>TODO test dates in info block
>SCHEDULED: <2027-01-01>

```
TODO test date in code block
SCHEDULED: <2027-01-01>
```

%%
TODO test date in comment block
SCHEDULED: <2027-01-01>
%%

---

```todoseq
search: file:"Test Dates"
```


---

Example of date range search

TODO task scheduled for 2026-06-02 
SCHEDULED: <2026-06-02>

TODO task scheduled for 2026-06-02 11:30pm
SCHEDULED: <2026-06-02 23:30>

TODO task scheduled for 2026-06-03 
SCHEDULED: <2026-06-03>

TODO task scheduled for 2026-06-03 12:30am
SCHEDULED: <2026-06-03 00:30>

TODO task scheduled for 2026-06-04 
SCHEDULED: <2026-06-04>

TODO task scheduled for 2026-06-04 11:30pm
SCHEDULED: <2026-06-04 23:30>

TODO task scheduled for 2026-06-05 
SCHEDULED: <2026-06-05>

TODO task scheduled for 2026-06-05 12:30am
SCHEDULED: <2026-06-05 00:30>

```todoseq
search: (scheduled:2026-06-03..2026-06-04)
sort: urgency
```

```todoseq
search: (scheduled:2026-06-03 OR scheduled:2026-06-04)
sort: urgency
```

^results should list 4 tasks in each

---

Month search

TODO task due in Feb
SCHEDULED: <2026-02-28 23:59>

TODO task due in March
SCHEDULED: <2026-03-01 00:01>

```todoseq
search: scheduled:"this month"
```

```todoseq
search: scheduled:"next month"
```


