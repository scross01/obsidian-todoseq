
`display: strip  group-by: priority`

```todoseq-dashboard
search:
group-by: priority
display: strip
```

`display: tiles`

```todoseq-dashboard
title: tiles by priority
search:
group-by: priority
display: tiles
```

`display:bar`

```todoseq-dashboard
title: bars by state
search: -state:completed
display: bar
group-by: state
layout: card
```

`display:bar  color: mono`

```todoseq-dashboard
title: bars by state
search: -state:completed
display: bar
group-by: state
color: mono
```

`display: bar  colapsed: true

```todoseq-dashboard
title: bar by priority (collapsible)
search: -priority:none
group-by: priority
display: bar
collapse: true
```

`display: donut`

```todoseq-dashboard
title: donut by tag
search: -state:completed
display: donut
group-by: tag
```

`display: column`

```todoseq-dashboard
title: column by keyword
search: state:active OR state:waiting
display: column
group-by: keyword
```

`display: heatmap`

```todoseq-dashboard
title: scheduled heatmap
search:
group-by: scheduled
display: heatmap
```
