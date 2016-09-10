var TypeaheadDropdowns = (function () {

    this._initialized = false;
    this.namingPrefix = 'fbt-dd-'; // css rules and ids will be prepended with this
    this.classNames = {
        highlight: namingPrefix + 'highlight',
        hidden: namingPrefix + 'hidden',
        input: namingPrefix + 'autocomplete',
        dropdown: namingPrefix + 'autocomplete-dropdown',
        matchingText: namingPrefix + 'dropdown-match'
    };

    // START LinkedList code

    var Node = function (value, idx) {
        this.data = value;
        this.index = idx;
        this.previous = null;
        this.next = null;
    }

    var LinkedList = function () {
        this.length = 0;
        this.head = null;
        this.tail = null;
    }

    LinkedList.prototype.add = function (value, idx) {
        var node = new Node(value, idx);

        if (this.length > 0) {
            this.tail.next = node;
            node.previous = this.tail;
            this.tail = node;
        } else {
            this.head = node;
            this.tail = node;
        }
        this.length++;
        return node;
    };

    LinkedList.prototype.getNodeAtPosition = function (position) {
        var currentNode = this.head,
            count = 0;
        if (this.length === 0 || position < 0 || position >= this.length) {
            console.warn("Error: No node exists at position " + position);
        }
        while (count < position) {
            currentNode = currentNode.next;
            count++;
        }
        return currentNode;
    };

    // END LinkedList code

    var TypeaheadDropdown = function (select) {
        var self = this,
            selectId = select.id || 'select-' + namingPrefix + '-' + generateId(8),
            inputId = 'input-' + namingPrefix + selectId,
            ulId = 'ul-' + namingPrefix + selectId,
            input = document.getElementById(inputId) || document.createElement('input'),
            ul = document.getElementById(ulId) || document.createElement('ul');

        select.id = selectId;
        input.id = inputId;
        ul.id = ulId;
        ul.innerHTML = '';

        // Attributes

        self.select = select;
        self.ul = ul;
        self.input = input;
        self.selectedItem = undefined;
        self.selectedItemIndex = undefined;
        self.visibleItems = undefined;
        self.visibleItemPositions = [],
        self.selectedItemValue = self.input.value;

        // Set up the input and list elements
        input.className = classNames.input;
        input.autocomplete = 'off';
        cloneStyle(select, input, 'font');
        select.parentNode.insertBefore(input, select);

        ul.className = classNames.dropdown;

        // Copy the <option>s into <li>s
        for (var itemIndex = 0; itemIndex < select.options.length; itemIndex++) {
            var o = select.options[itemIndex];
            var li = document.createElement("li");
            setText(li, o.text);
            if (o.selected) {
                self.selectedItem = li;
                self.selectedItemIndex = itemIndex;
            }
            li.onmousedown = function (evt) {
                self.input.value = getText(evt.target);
                self.selectedItem = evt.target;
                self.selectedItemIndex = itemIndex;
                self.hide();
            };
            li.onmouseenter = function (evt) {
                addClass(evt.target, classNames.highlight);
            };
            ul.appendChild(li);
        }

        document.body.appendChild(ul); // append this to the body so that it can be absolutely positioned relative to the body

        self.select.title = getText(self.selectedItem);

        // TODO - allow the <ul>'s width to match that of the longest <li>
        // To determine the width of the longest <li>, you have to render it, but you could position the entire ul way offscreen to do this.
        // Don't allow the <ul>'s width to exceed the screen size, though.
        // Q: What should we do if there are long items in a <ul> that's near the right side of the screen?  Shift the <ul> to the left?

        self.hide();

        // ***Event Handlers***

        self.ul.onmouseover = function (evt) {
            var highlighted = ul.querySelector("li." + classNames.highlight);
            removeClass(highlighted, classNames.highlight);
        };

        self.select.onmousedown = function (evt) {
            // This keeps the <select> from opening in Firefox
            evt.preventDefault();
            self.select.focus();
        };

        self.select.onfocus = function (evt) {

            // position the input
            var selectRect = evt.target.getBoundingClientRect();
            setPosition(input, selectRect.top, selectRect.left, selectRect.width);

            self.show(); // if you don't call this here, the input won't have a bounding rectangle when you call input.getBoundingClientRect()

            // position the ul
            var inputRect = input.getBoundingClientRect();
            setPosition(ul, inputRect.bottom, inputRect.left, inputRect.width - input.clientLeft, true);

            // set the input's value to the current selection
            var selectedText = select[select.selectedIndex].text;
            input.value = selectedText;

            self.update(true);
            input.select();
            return false;
        };

        var blurTheInput = function() {
            // manually trigger the input's onblur event
            var blurInputEvent = document.createEvent('UIEvent');
            blurInputEvent.initEvent('blur', true, true);
            input.dispatchEvent(blurInputEvent);
        }

        document.addEventListener('scroll', function (evt) {
            // When the user scrolls, the dropdown should auto-hide, just like a normal dropdown.
            if (!self.visible) return;
            blurTheInput();
        });

        self.input.onblur = function (evt) {
            selectedText = input.value;
            for (var i = 0; i < select.options.length; i++) {
                if (getText(select.options[i]).trim() === selectedText) {
                    if (select.selectedIndex == i) break; // no change
                    select.selectedIndex = i;
                    self.selectedItem = self.ul.getElementsByTagName("li")[i];
                    self.selectedItemIndex = i;
                    self.selectedItemValue = selectedText;
                    self.select.title = getText(self.selectedItem);

                    // manually trigger the select's onchange event
                    var selectChangedEvent = document.createEvent('UIEvent');
                    selectChangedEvent.initEvent('change', true, true);
                    select.dispatchEvent(selectChangedEvent);

                    break;
                }
            }
            self.hide();
            return false;
        };

        self.input.onkeydown = function (e) {
            if (e.keyCode === 38) { // move up
                var selectedVisibleNode = self.visibleItems.getNodeAtPosition(self.visibleItemPositions[self.selectedItemIndex]);
                if (selectedVisibleNode.previous !== null) {
                    self.selectedItem = selectedVisibleNode.previous.data;
                    self.selectedItemIndex = selectedVisibleNode.previous.index;
                    self.highlightSelected();

                    self.input.value = getText(self.selectedItem);
                    self.input.focus();
                }
                if (!itemIsVisible(self.selectedItem, self.ul)) {
                    self.ul.scrollTop = self.selectedItem.offsetTop;
                }
                window.setTimeout(function () { self.input.setSelectionRange(self.input.value.length, self.input.value.length); }, 0); // move the cursor to the end of the <input>
            } else if (e.keyCode === 40) { // move down
                var visPos = self.visibleItemPositions[self.selectedItemIndex],
                    nextNode;

                if (typeof (self.selectedItem) === 'undefined' || typeof (visPos) === 'undefined') {
                    // the selected index is not visible, so we need to change it to the first visible index
                    self.selectedItemIndex = self.getFirstVisibleItemIndex();
                    visPos = self.visibleItemPositions[self.selectedItemIndex];

                    if (typeof (self.selectedItemIndex) === 'undefined' || typeof (visPos) === 'undefined') {
                        return;
                    }
                    nextNode = self.visibleItems.getNodeAtPosition(self.visibleItemPositions[self.selectedItemIndex]);
                } else {
                    visPos = self.visibleItemPositions[self.selectedItemIndex];
                    var selectedVisibleNode = self.visibleItems.getNodeAtPosition(self.visibleItemPositions[self.selectedItemIndex]);
                    if (selectedVisibleNode.next !== null) {
                        nextNode = selectedVisibleNode.next;
                    }
                }

                if (typeof (nextNode) !== 'undefined') {
                    self.selectedItem = nextNode.data;
                    self.selectedItemIndex = nextNode.index;
                    self.highlightSelected();
                    self.input.value = getText(self.selectedItem);

                    if (!itemIsVisible(self.selectedItem, self.ul)) {
                        self.ul.scrollTop = self.selectedItem.offsetTop - (self.ul.clientHeight - self.selectedItem.offsetHeight);
                    }
                }
            } else if (e.keyCode === 10 || e.keyCode === 13 || e.keyCode === 27 ) { // line feed, Enter, Esc
                blurTheInput();
                return false;
            }
        };

        self.input.onkeyup = function (e) {
            if (e.target.value !== self.selectedItemValue) {
                if (arrayContains([
                    37, 38, 39, 40, // left, up, right, down
                     9, // tab
                    16, // shift
                    17, // ctrl
                    18, // alt
                    19, // pause/break
                    20, // capslock
                    35, // end
                    36, // home
                    45, // insert
                    91, 92, // window keys
                    112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123 // F1-12
                ], e.keyCode)) return true;

                self.selectedItemValue = e.target.value;
                self.selectedItemIndex = undefined;
                self.selectedItem = undefined;

                highlightedItem = self.ul.querySelector("li." + classNames.highlight);
                if (highlightedItem !== null) {
                    removeClass(highlightedItem, classNames.highlight);
                }

                window.setTimeout(function () {
                    self.update(false);
                }, 0);
            }
        };
    };

    TypeaheadDropdown.prototype.getFirstVisibleItemIndex = function () {
        var self = this;
        for (var i = 0; i < self.visibleItemPositions.length; i++) {
            if (typeof (self.visibleItemPositions[i]) !== 'undefined') {
                return i;
            }
        }
        return 0;
    };

    TypeaheadDropdown.prototype.highlightSelected = function () {
        var self = this,
            highlightedItem = self.ul.querySelector("li." + classNames.highlight);
        removeClass(highlightedItem, classNames.highlight); // remove old highlight
        addClass(self.selectedItem, classNames.highlight);
    };

    TypeaheadDropdown.prototype.show = function () {
        this.visible = true;
        this.input.hidden = false;
        this.ul.hidden = false;
        this.select.hidden = true;
    };

    TypeaheadDropdown.prototype.hide = function () {
        this.visible = false;
        this.input.hidden = true;
        this.ul.hidden = true;
        this.select.hidden = false;
        this.select.blur();
    };

    TypeaheadDropdown.prototype.update = function (showAllItems) {

        // This function makes items visible or hidden when displaying or filtering the dropdown.
        // If showAllItems is true, all items are made visible.  This is done during select.onfocus.
        // Otherwise, an item must match the text in the input, case-insensitively.  This is done during onkeydown.
        // If an item has been selected, it will be highlighted and scrolled into view.

        var self = this,
            textRaw = self.input.value,
            textSafe = textRaw.toLowerCase().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"), // sanitize for use in a regex
            items = self.ul.getElementsByTagName("li"),
            hideThese = [],
            showThese = [],
            visibleItems = new LinkedList(),
            visibleItemPositions = [],
            vp = 0;

        for (var i=0; i<items.length; i++) {
            var item = items[i];

            if (showAllItems || getText(item).toLowerCase().match(textSafe) !== null) {
                showThese.push(item);
                visibleItems.add(item, i);
                visibleItemPositions[i] = vp++;
            } else {
                hideThese.push(item);
            }
        }

        hideThese.map(function (item) { addClass(item, classNames.hidden) });
        showThese.map(function (item) { removeClass(item, classNames.hidden) });

        if (typeof (self.selectedItem) !== 'undefined') {
            self.highlightSelected();
        }

        self.visibleItems = visibleItems;
        self.visibleItemPositions = visibleItemPositions;

        if (!itemIsVisible(self.selectedItem, self.ul)) {
            self.ul.scrollTop = self.selectedItem.offsetTop;
        }
    };

    var injectStyles = function (namingPrefix) {
        // Inject styles into the <head>.  Anything in {{braces}} will be eval'd.
        var self = this,
            styles,
            head = document.head || document.getElementsByTagName('head')[0],
            styleElement = document.createElement('style'),
            classNames = self.classNames;

        styles = '.{{classNames.hidden}} { \
      display: none; \
} \
input.{{classNames.input}} { \
      padding-left: 7px; \
} \
ul.{{classNames.dropdown}} { \
      position: absolute; \
      background: white; \
      padding-left: 0px; \
      margin: 0px; \
      max-height: 200px; \
      overflow-y: auto; \
      border: solid rgb(121, 155, 210) 1px; \
      text-align: left; \
      z-index: 999; \
} \
ul.{{classNames.dropdown}} li { \
      list-style-type: none; \
      cursor: default; \
      padding-left: 7px; \
} \
ul.{{classNames.dropdown}} li.{{classNames.highlight}} { \
      background: rgb(30, 144, 255); \
      color: white; \
} \
ul.{{classNames.dropdown}} li span.{{classNames.matchingText}} { \
      font-weight: bold; \
      color: purple; \
    } \
';

        // update all the {{class names}}
        styles = styles.replace(/{{(.*?)}}/g, function (str) { return eval(str); })

        styleElement.type = 'text/css';
        if (styleElement.styleSheet) {
            style.styleSheet.cssText = styles;
        } else {
            styleElement.appendChild(document.createTextNode(styles));
        }
        head.appendChild(styleElement);
    };

    var itemIsVisible = function (item, ul) {
        if (typeof (item) === 'undefined' || typeof (ul) === 'undefined') return true;
        var ulTop = ul.scrollTop,
            ulBottom = ulTop + ul.clientHeight,
            itemTop = item.offsetTop,
            itemBottom = itemTop + item.offsetHeight;
        return (itemTop >= ulTop && itemBottom <= ulBottom);
    };

    var arrayContains = function (arr, val) {
        if (arr.length === 0) return false;
        return arr.map(function (x) { return x === val }).reduce(function (prevVal, currVal) { return prevVal || currVal });
    };

    var setPosition = function (elt, top, left, width, allowWider) {
        // position elt and assign width, taking the window's scroll position into account
        var vertScroll = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0,
        hortScroll = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
        top = top + vertScroll;
        left = left + hortScroll;
        elt.style.top = top + "px";
        elt.style.left = left + "px";
        if (allowWider) {
            elt.style.minWidth = width + "px";
        } else {
            elt.style.width = width + "px";
        }
    };

    var cloneStyle = function (src, dest, attr) {
        dest.style[attr] = window.getComputedStyle(src)[attr];
    };

    var removeClass = function (item, className) {
        if (typeof (className) === undefined || className === '' || typeof (item) === 'undefined' || item === null) return;
        var re = new RegExp('(?:^|\\s)' + className + '(?!\\S)', 'gi');
        item.className = item.className.replace(re, '');
    };

    var addClass = function (item, className) {
        if (item.className === '') {
            item.className = className;
        } else {
            if (item.className.toLowerCase().indexOf(className.toLowerCase()) === -1) {
                item.className += " " + className;
            }
        }
    };

    var setText = function (elt, text) {
        if (elt.hasOwnProperty('innerText')) {
            elt.innerText = text;
        } else {
            elt.textContent = text;
        }
    };

    var getText = function (elt, text) {
        if (typeof(elt) === 'undefined') return;
        if (elt.hasOwnProperty('innerText')) {
            return elt.innerText;
        } else {
            return elt.textContent;
        }
    };

    var generateId = function (len) {
        var id = "",
            chars = "abcdefghijklmnopqrstuvwxyz";

        for (var i=0; i<len; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    };

    var cleanUpRemovedDropdown = function (select) {
        var selectId = select.id,
            inputId,
            ulId;

        if (typeof (selectId) !== 'undefined') {
            inputId = 'input-' + namingPrefix + selectId,
            ulId = 'ul-' + namingPrefix + selectId,
            input = document.getElementById(inputId);
            ul = document.getElementById(ulId);
            if (input) {
                input.parentElement.removeChild(input);
            }
            if (ul) {
                ul.parentElement.removeChild(ul);
            }
        }
    };

    var loadPolyfills = function () {
        // Polyfill for Element.matches()
        // HT https://developer.mozilla.org/en-US/docs/Web/API/Element/matches
        if (!Element.prototype.matches) {
            Element.prototype.matches =
                Element.prototype.matchesSelector ||
                Element.prototype.mozMatchesSelector ||
                Element.prototype.msMatchesSelector ||
                Element.prototype.oMatchesSelector ||
                Element.prototype.webkitMatchesSelector ||
                function (s) {
                    var matches = (this.document || this.ownerDocument).querySelectorAll(s),
                        i = matches.length;
                    while (--i >= 0 && matches.item(i) !== this) { }
                    return i > -1;
                };
        }
    };

    // MutationObserver code:
    // This handles any <select>s that are added or removed after the initial call to TypeaheadDropdowns.init().
    // For example, if a page uses AJAX to load a <select>, or if the <options> in a <select> are modified via AJAX,
    // this observer code should handle initializing the TypeaheadDropdown.
    var initObserver = function (dropdownSelector) {

        var self = this,
        observerConfig = {
            attributes: false,
            childList: true,
            characterData: false,
            subtree: true
        };

        var observer = new MutationObserver(function (mutations) {

            var newSelects = [],
                modifiedSelects = [],
                removedSelects = [];

            mutations.forEach(function (mutation) {
                for (var i=0; i<mutation.addedNodes.length; i++) {
                    var n = mutation.addedNodes[i];
                    if (n.nodeType != 1) continue; // ignore non-Element nodes

                    var childSelects = n.querySelectorAll(dropdownSelector);

                    if (n.matches(dropdownSelector)) {
                        newSelects.push(n);
                        observer.observe(n, observerConfig)
                    } else if (childSelects.length > 0) {
                        for (var j=0; j<childSelects.length; j++) {
                            newSelects.push(childSelects[j]);
                            observer.observe(childSelects[j], observerConfig);
                        }
                    } else if (n.tagName.toLowerCase() === 'option') {
                        if (!arrayContains(modifiedSelects, n.parentNode)) {
                            modifiedSelects.push(n.parentNode);
                        }
                    }
                }

                // if an ancestor of a <select> is removed, we are not currently detecting that
                for (var i=0; i<mutation.removedNodes.length; i++) {
                    var n = mutation.removedNodes[i];
                    if (typeof (n.tagName) === 'undefined') continue;
                    if (n.matches(dropdownSelector)) {
                        removedSelects.push(n);
                    }
                }
            });

            newSelects.forEach(function (selectNode) {
                TypeaheadDropdowns.initFromNode(selectNode);
            });

            modifiedSelects.forEach(function (selectNode) {
                TypeaheadDropdowns.initFromNode(selectNode);
            });

            removedSelects.forEach(function (selectNode) {
                cleanUpRemovedDropdown(selectNode);
            });
        });

        // this will catch newly-added <select> elements
        observer.observe(document.body, observerConfig);

        // this will catch changes to a <select>'s option elements
        var selectNodes = document.querySelectorAll(dropdownSelector);
        for (var i=0; i<selectNodes.length; i++) {
            observer.observe(selectNodes[i], observerConfig);
        };
    };

    var initFromNode = function (node) {
        if (node.tagName.toLowerCase() !== 'select') return;
        (function () {
            new TypeaheadDropdown(node);
        })()
    };

    var init = function (dropdownSelector) {

        var self = this;
        if (self._initialized) return;

        // If MutationObserver is not defined, silently do nothing.  Users will see regular dropdowns.
        if (MutationObserver) {

            dropdownSelector = dropdownSelector || 'select'; // update all selects by default

            initObserver(dropdownSelector);

            injectStyles();

            loadPolyfills();

            var selects = document.querySelectorAll(dropdownSelector);
            for (var i=0; i<selects.length; i++) {
                if (selects[i].tagName.toLowerCase() !== 'select') {
                    console.log("The selector passed to TypeaheadDropdowns.init() should only include <select> elements.  Skipping: " + selects[i].tagName);
                    continue;
                }
                new TypeaheadDropdown(selects[i]);
            }
        } else {
            console.log("TypeaheadDropdowns cannot be initialized, because this browser does not support the MutationObserver API.");
        }

        self._initialized = true;
    };

    // export public methods
    return {
        init: init,
        initFromNode: initFromNode
    };
})();

// Don't forget to call this on the page where you are including this file:
// TypeaheadDropdowns.init(); // you can pass a selector like "select.typehead" if you only want to modify certain <select> elements.
