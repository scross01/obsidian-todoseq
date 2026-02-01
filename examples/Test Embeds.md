Obsidian embedded references can be used to reference lines with tasks. 

TODO this is a task with a embed reference ^abc123

- [ ] TODO this is a checkbox task with a embed reference ^xyz123

The task can be references on a page with:
```
![[Test Embeds#^abc123]]
```

![[Test Embeds#^abc123]]

![[Test Embeds#^xyz123]]


```todoseq
search: file:"Test Embeds"
```


---

Embed references can also be from other pages, e.g.
```
![[Test Examples^xyz123]]
```

![[Task Examples#^xyz789]]

![[Task Examples#^xyz123]]

>[!info]
>Only the original task declaration location is collected by TODOseq
>


```todoseq
search: file:"Task Examples"
```
