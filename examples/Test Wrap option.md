
TODO example task with a very long task description that needs to wrap on to the next line
DOING another example task with a very long task description that needs to wrap on to the next line

Default (`wrap-content: dynamic`)
```todoseq
search: path:examples file:"Test Wrap option"
wrap-content: dynamic
```

With `wrap-content: false`
```todoseq
search: path:examples file:"Test Wrap option"
wrap-content: false
```

---

With `wrap-content: true`
```todoseq
search: path:examples file:"Test Wrap option"
wrap-content: true
```

With `wrap-content: true` and `show-file: false`
```todoseq
search: path:examples file:"Test Wrap option"
wrap-content: true
show-file: false
```
