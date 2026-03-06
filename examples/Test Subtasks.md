
Subtasks must be indented from the parent task by at least one space or tab

TODO a task with subtasks
 - [ ] subtask 1
 - [ ] subtask 2
 - [ ] TODO subtask 3 is also a task
 - [ ] TODO subtask 4 has subtasks
	 - [ ] next level subtask

TODO a task with some completed subtasks
 - [x] subtask 1 (completed)
 - [ ] subtask 2
 - [x] subtask 3 (completed)

TODO a task with all completed subtasks
 - [x] subtask 1
 - [x] subtask 2

- TODO a bulleted task with subtasks
	- [ ] subtask 1
	- [ ] subtask 2

- [ ] TODO a checkbox task with subtasks
	- [ ] subtask 1
	- [ ] subtask 2

> TODO a quoted task with subtasks (not supported)
>   - [ ] subtask 1
>   - [ ] subtask 2 

TODO a scheduled task with subtasks
SCHEDULED: <2026-02-13>
  - [ ] subtask 1
  - [ ] subtask 2

TODO a task with deadline and subtasks
DEADLINE: <2026-03-01>
  - [ ] subtask 1
  - [x] subtask 2

TODO a task with both scheduled and subtasks
SCHEDULED: <2026-02-20>
DEADLINE: <2026-02-25>
  - [ ] subtask 1
  - [x] subtask 2
  - [ ] subtask 3

TODO task with checkbox items not indented (should not show subtasks)
- [ ] not a subtask 1
- [ ] not a subtask 2

TODO task that should stop subtask detection (next task)
 - [ ] subtask 1
TODO another task after subtask

---

```todoseq
search: file:"Test Subtasks"
wrap-content: dynamic
```
