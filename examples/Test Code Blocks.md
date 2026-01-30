Examples of using task keywords in different code blocks.

Enabled the "Include tasks in code blocks" and "Enable language comment support" settings options to capture all tasks on this page. 

```
TODO 1 task in code block 
```

	TODO 2 task in an indended code block

C++
```cpp
/* TODO 3 commented task on first line of C++ multiline comment block
 * TODO 4 commented task in C++ multiline comment block
 */

/* TODO 5 commented task in C++ multiline comment block single line */

// TODO 6 commented task in C++ code block

TODO 7 still valid

void test() // TODO 8 inline commented task in C++ code block

void test() /* TODO 9 inline commented task in C++ code block */
```

SQL
```sql
/* TODO 10 commented task on first line of SQL multiline comment block
 * TODO 11 commented task in SQL multiline comment block
 */

/* TODO 12 commented task in SQL multiline comment block single line */

-- TODO 13 commented task in SQL code block

SELECT * from mytable;  -- TODO 14 inline commented task in SQL code block

SELECT * from mytable;  /* TODO 15 inline multiline commented task in SQL code block */

SELECT * from mytable;  # TODO 16 mysql style comment
```

Python
```python
''' TODO 17 task on first line of Python multiline comment block
TODO 18 task in Python multiline comment block
  TODO 19 intended task in Python multiline comment block
'''

# TODO 20 commented task in Python code block
def myfunction():  # TODO 21 inline commented task in Python code block
```

Java
```java
/* TODO 22 commented task on first line of Java multiline comment block
 * TODO 23 commented task in Java multiline comment block
 */
// TODO 24 commented task in Java code block
public static void myFunction() {  // TODO 25 inline commented task in Java code block
}
```

Javascript
```js
/* TODO 26 commented task on first line of Javascript multiline comment block
 * TODO 27 commented task in Javascript multiline comment block
 */
// TODO 28 commented task in Javascript code block
public static void myFunction() {  // TODO 29 inline commented task in Javascript code block
}
```

Typescript
```ts
/* TODO commented task on first line of Typescript multiline comment block
 * TODO commented task in Typescript multiline comment block
 */
// TODO commented task in Typescript code block
public static void myFunction() {  // TODO inline commented task in Typescript code block
}
```

Go Lang
```go
/* TODO commented task on first line of Golang multiline comment block
 * TODO commented task in Golang multiline comment block
 */
// TODO commented task in Golang code block
func main() {  // TODO inline commented task in Golang code block
}
```

YAML
```yml
# TODO commented task in YAML code block
example:
  - value # TODO inline commented task in YAML code block
```

TOML
```toml
# TODO task is TOML comment
```

INI
```ini
; TODO task is INI comment
```

Swift
```swift
// TODO in Swift comment
```

C
```c
/* TODO in C comment */
```

---

```todoseq
search: file:"Test Code Blocks"
```
