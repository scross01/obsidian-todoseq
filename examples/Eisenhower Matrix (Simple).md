
Using multiple embedded queries for queriing important and urgent tasks you create an equivalent of an Eisenhower Matrix, although Obsidian/Markdown doesn't natively support code blocks in tables to layout a true grid. See [[Eisenhower Matrix (Canvas).canvas]] for an alternative option.

```todoseq
title: Urgent and Important
search: priority:high
```

```todoseq
title: Not Urgent but Important
search: priority:medium
```

```todoseq
title: Urgent but not Important
search: priority:low
```

```todoseq
title: Neither urgent nor important
search: -(priority:high OR priority:medium OR priority:low)
limit: 5
```

Customize the queries base on you own definition of important and urgent, e.g.

````markdown
```todoseq
search: tag:urgent AND tag:important
```
```todoseq
search: -tag:urgent AND tag:important
```
```todoseq
search: tag:urgent AND -tag:important
```
```todoseq
search: -(tag:urgent OR -tag:important)
```
````
