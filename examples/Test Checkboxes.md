Examples of using markdown checkboxes in front of the TODOseq task keywords.

- [ ] TODO this is todo.
- [ ] DOING this is doing
- [x] DONE this is done
- [ ] LATER this is later
- [ ] NOW this is now
- [ ] IN-PROGRESS this is in progress
- [ ] WAIT this is wait
- [ ] WAITING this is waiting
- [x] CANCELED this is canceled
- [x] CANCELLED this is cancelled

**Indented Checkboxes**

- [ ] TODO Parent checkbox
	- [ ] TODO Indented checkbox
	- [ ] DOING another Intended checkbox
	- [x] DONE completed indented checkbox

**Quoted Checkboxes**

> - [ ] TODO quoted checkbox
> - [ ] DOING another quoted checkbox
> - [x] DONE yet another quoted checkbox

*^ above formatting issue appears to be an Obsidian bug in the editor view*

**Custom keywords**

Ensure FIXME and HACK are in the custom keyword settings.

- [ ] FIXME this is a custom keyword
- [ ] HACK this is also custom keyword
- [ ] WIP this not a custom keyword

**Normal checkboxes**

- [ ] regular checkbox without a task keyword
- [x] completed checkbox without a task keyword

---

```todoseq
search: file:"Test Checkboxes"
```




