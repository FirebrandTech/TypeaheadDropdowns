# Typeahead Dropdowns

> Add typeahead filtering to any <select> with a single JS include.

Here is an [example](example.html)

## Usage

```
<script src="typeahead-dropdowns.js"></script>
<script>
      TypeaheadDropdowns.init();
</script>
```

Or, if you only want to add typeahead filtering to certain selects, you can specify a query selector, like this:

```
TypeheadDropdowns.init("select.filterme");
```

## Notes

This is especially useful if you have some long dropdown lists and would like to be able to type a few characters to filter down the list.  It does not use AJAX to load the list content during filtering, so it won't save you on loading the page initially, but it will make a long dropdown more usable.

**What if my DOM changes after the page loads?**

We use MutationObservers to initialized new or modified <select> elements, so this should not be a problem, but it has only been tested in a few scenarios.

**Can I use the arrow keys to select elements in the dropdown?**

Yes, we have tried to imitate normal dropdown behavior as much as possible, so the arrow keys move the selection normally.

Currently, the Home and End keys will _not_ jump you to the beginning or end of the dropdown list, however.  Instead they move your cursor in the typehead input.

## License

MIT © [Firebrand Technologies](http://firebrandtech.com)