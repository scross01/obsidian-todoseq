CANCELED test 10
DONE test 9
WAIT test 8
HACK test 7
FIXME [#A] test 6 
LATER [#B] test 5 
TODO [#C] test 4 
IN-PROGRESS test 3
DOING test 2
NOW test 1

`keyword` sort results should show as orders task 1 to task 10 
```todoseq
search: file:"Test Sort"
sort: keyword
```

`filepath` sort results should be in the order defiled, lines 1..10
```todoseq
search: file:"Test Sort"
sort: filepath
```

`priority` sort A, B, C at top then remaining tasks in filepath order 
```todoseq
search: file:"Test Sort"
sort: priority
show-completed: sort-to-end
```

`urgency` sort results based on urgency score
```todoseq
search: file:"Test Sort"
sort: urgency
```
