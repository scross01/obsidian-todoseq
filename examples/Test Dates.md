
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

```python
# TODO test date in language block
# SCHEDULED: <2027-01-01>
```

%%
TODO test date in comment block
SCHEDULED: <2027-01-01>
%%
