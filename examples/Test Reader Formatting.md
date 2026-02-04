This file is used to test the reader view formatting functionality.

Open the page in both editor and reader modes side by side to compare the formatted output.

## Task Examples

TODO This is an incomplete task
DOING This task is in progress
DONE This task is completed

> TODO This is an incomplete task in quote
> DOING This task is in progress in quote
> DONE This task is completed in quote

- TODO This is an incomplete task with bullet
- DOING This task is in progress with bullet
- DONE This task is completed with bullet

- [ ] TODO This is an incomplete task with checkbox
- [ ] DOING This task is in progress with checkbox
- [x] DONE This task is completed with checkbox

## Scheduled and Deadline Examples

TODO Task with scheduled date
SCHEDULED: <2023-01-15>

TODO Task with deadline
DEADLINE: <2023-12-31>

DONE Task with both scheduled and deadline
SCHEDULED: <2023-01-15>
DEADLINE: <2023-12-31>

## Priority Examples

TODO [#A] High priority task
DOING [#B] Medium priority task  
DONE [#C] Low priority task

## Mixed Content

Regular paragraph text that should not be affected by formatting.

TODO Task in a list with **bold text** and *italic text*
DOING Another task with `code formatting`
DONE Task with **bold text** and ==highlight==

- [ ] TODO Task in a list with **bold text** and *italic text*
- [ ] DOING Another task with `code formatting`
- [x] DONE Task with **bold text** and ==highlight==

More regular text here.

## Custom Keywords

TODO this is a regular task
HACK this is a custom hack task

FIXME this is a custom task
WIP this is not a keyword so should not be styled

## Code Blocks

Tasks is code blocks are not styled in the reader view

```python
TODO task in a code block
# TODO comment task in code block
```

## Comment blocks

Comment blocks are not displayed in the reader view

%% TODO task in comment %%

%%
TODO task in comment
%%

## Edge Cases

- [ ] TODO Task at end of line with no space
- [ ] TODO
- [ ] TODO     Multiple spaces after keyword

Dates without associated tasks should not be styled.

SCHEDULED: <2023-01-01>
DEADLINE: <2023-12-31>

---

```todoseq
search: file:"Test Reader Formatting"
```
