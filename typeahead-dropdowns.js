// This Array.includes polyfill is required for IE.
// From: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/includes?v=example#Polyfill
if (!Array.prototype.includes) {
  Object.defineProperty(Array.prototype, "includes", {
    value: function (searchElement, fromIndex) {
      if (this == null) throw new TypeError('"this" is null or not defined');

      var o = Object(this);
      var len = o.length >>> 0;
      if (len === 0) {
        return false;
      }
      var n = fromIndex | 0;
      var k = Math.max(n >= 0 ? n : len - Math.abs(n), 0);
      function sameValueZero(x, y) {
        return (
          x === y ||
          (typeof x === "number" &&
            typeof y === "number" &&
            isNaN(x) &&
            isNaN(y))
        );
      }
      while (k < len) {
        if (sameValueZero(o[k], searchElement)) {
          return true;
        }
        k++;
      }
      return false;
    },
  });
}

var TypeaheadDropdowns = (function () {
  var _initialized = false;
  var namingPrefix = "fbt-tadd-"; // css rules and ids will be prepended with this
  var classNames = {
    highlight: namingPrefix + "highlight",
    hidden: namingPrefix + "hidden",
    input: namingPrefix + "autocomplete",
    dropdown: namingPrefix + "autocomplete-dropdown",
    matchingText: namingPrefix + "dropdown-match",
  };

  // START LinkedList code

  var Node = function (value, idx) {
    this.data = value;
    this.index = idx;
    this.previous = null;
    this.next = null;
  };

  var LinkedList = function () {
    this.length = 0;
    this.head = null;
    this.tail = null;
  };

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
      selectId = select.id || "select-" + namingPrefix + "-" + generateId(8),
      inputId = "input-" + namingPrefix + selectId,
      ulId = "ul-" + namingPrefix + selectId,
      input =
        document.getElementById(inputId) || document.createElement("input"),
      ul = document.getElementById(ulId) || document.createElement("ul");

    select.id = selectId;
    input.id = inputId;
    ul.id = ulId;
    ul.innerHTML = "";

    // Attributes

    self.select = select;
    self.ul = ul;
    self.input = input;
    self.selectedItem = undefined;
    self.selectedItemIndex = undefined;
    self.visibleItems = undefined;
    (self.visibleItemPositions = []),
      (self.selectedItemValue = self.input.value);
    self.suppressScrollHandler = false; // a hack for not triggering a scroll event if rendering the list changes the height of the document

    // Set up the input and list elements
    input.className = classNames.input;
    input.autocomplete = "off";
    cloneStyle(select, input, "font");
    select.parentNode.insertBefore(input, select);

    ul.className = classNames.dropdown;

    // Copy the <option>s into <li>s
    for (var itemIndex = 0; itemIndex < select.options.length; itemIndex++) {
      var o = select.options[itemIndex];
      var li = document.createElement("li");
      var itemText = getText(o);
      setText(li, itemText);
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
      if (select.selectedIndex === -1) {
        // the select is empty
        return true;
      }

      // position the input
      var selectRect = evt.target.getBoundingClientRect();
      setPosition(input, selectRect.top, selectRect.left, selectRect.width);

      var docHeight = document.body.offsetHeight;
      self.show(); // if you don't call this here, the input won't have a bounding rectangle when you call input.getBoundingClientRect()
      if (document.body.offsetHeight != docHeight) {
        self.suppressScrollHandler = true;
      }

      // position the ul
      self.positionList(input, ul);

      // set the input's value to the current selection
      input.value = getText(select[select.selectedIndex]);

      self.update(true);
      input.select();
      return false;
    };

    var blurTheInput = function () {
      // manually trigger the input's onblur event
      var blurInputEvent = document.createEvent("UIEvent");
      blurInputEvent.initEvent("blur", true, true);
      input.dispatchEvent(blurInputEvent);
    };

    document.addEventListener("scroll", function (evt) {
      // When the user scrolls, the dropdown should auto-hide, just like a normal dropdown.
      if (!self.visible) return;
      if (self.suppressScrollHandler) {
        self.suppressScrollHandler = false;
        return;
      }
      blurTheInput();
    });

    self.input.onblur = function (evt) {
      selectedText = input.value;
      for (var i = 0; i < select.options.length; i++) {
        if (getText(select.options[i]) === selectedText) {
          if (select.selectedIndex == i) break; // no change
          select.selectedIndex = i;
          self.selectedItem = self.ul.getElementsByTagName("li")[i];
          self.selectedItemIndex = i;
          self.selectedItemValue = selectedText;
          self.select.title = getText(self.selectedItem);

          // manually trigger the select's onchange event
          var selectChangedEvent = document.createEvent("UIEvent");
          selectChangedEvent.initEvent("change", true, true);
          select.dispatchEvent(selectChangedEvent);

          break;
        }
      }
      self.hide();
      return false;
    };

    self.input.onkeydown = function (e) {
      if (e.keyCode === 38) {
        // move up
        var selectedVisibleNode = self.visibleItems.getNodeAtPosition(
          self.visibleItemPositions[self.selectedItemIndex]
        );
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
        window.setTimeout(function () {
          self.input.setSelectionRange(
            self.input.value.length,
            self.input.value.length
          );
        }, 0); // move the cursor to the end of the <input>
      } else if (e.keyCode === 40) {
        // move down
        var visPos = self.visibleItemPositions[self.selectedItemIndex],
          nextNode;

        if (
          typeof self.selectedItem === "undefined" ||
          typeof visPos === "undefined"
        ) {
          // the selected index is not visible, so we need to change it to the first visible index
          self.selectedItemIndex = self.getFirstVisibleItemIndex();
          visPos = self.visibleItemPositions[self.selectedItemIndex];

          if (
            typeof self.selectedItemIndex === "undefined" ||
            typeof visPos === "undefined"
          ) {
            return;
          }
          nextNode = self.visibleItems.getNodeAtPosition(
            self.visibleItemPositions[self.selectedItemIndex]
          );
        } else {
          visPos = self.visibleItemPositions[self.selectedItemIndex];
          var selectedVisibleNode = self.visibleItems.getNodeAtPosition(
            self.visibleItemPositions[self.selectedItemIndex]
          );
          if (selectedVisibleNode.next !== null) {
            nextNode = selectedVisibleNode.next;
          }
        }

        if (typeof nextNode !== "undefined") {
          self.selectedItem = nextNode.data;
          self.selectedItemIndex = nextNode.index;
          self.highlightSelected();
          self.input.value = getText(self.selectedItem);

          if (!itemIsVisible(self.selectedItem, self.ul)) {
            self.ul.scrollTop =
              self.selectedItem.offsetTop -
              (self.ul.clientHeight - self.selectedItem.offsetHeight);
          }
        }
      } else if (e.keyCode === 10 || e.keyCode === 13 || e.keyCode === 27) {
        // line feed, Enter, Esc
        blurTheInput();
        return false;
      }
    };

    self.input.onkeyup = function (e) {
      if (e.target.value !== self.selectedItemValue) {
        if (
          arrayContains(
            [
              37,
              38,
              39,
              40, // left, up, right, down
              9, // tab
              16, // shift
              17, // ctrl
              18, // alt
              19, // pause/break
              20, // capslock
              35, // end
              36, // home
              45, // insert
              91,
              92, // window keys
              112,
              113,
              114,
              115,
              116,
              117,
              118,
              119,
              120,
              121,
              122,
              123, // F1-12
            ],
            e.keyCode
          )
        )
          return true;

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
      if (typeof self.visibleItemPositions[i] !== "undefined") {
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
    this.ulPosition = undefined;
  };

  TypeaheadDropdown.prototype.update = function (showAllItems) {
    // This function makes items visible or hidden when displaying or filtering the dropdown.
    // If showAllItems is true, all items are made visible.  This is done during select.onfocus.
    // Otherwise, an item must match the text in the input, case-insensitively.  This is done during onkeydown.
    // If an item has been selected, it will be highlighted and scrolled into view.

    var self = this,
      textRaw = self.input.value,
      textSafe = textRaw
        .toLowerCase()
        .replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"), // sanitize for use in a regex
      items = self.ul.getElementsByTagName("li"),
      hideThese = [],
      showThese = [],
      visibleItems = new LinkedList(),
      visibleItemPositions = [],
      vp = 0;

    for (var i = 0; i < items.length; i++) {
      var item = items[i];

      if (
        showAllItems ||
        getText(item).toLowerCase().match(textSafe) !== null
      ) {
        showThese.push(item);
        visibleItems.add(item, i);
        visibleItemPositions[i] = vp++;
      } else {
        hideThese.push(item);
      }
    }

    hideThese.map(function (item) {
      addClass(item, classNames.hidden);
    });
    showThese.map(function (item) {
      removeClass(item, classNames.hidden);
    });

    self.positionList(self.input, self.ul);

    if (typeof self.selectedItem !== "undefined") {
      self.highlightSelected();
    }

    self.visibleItems = visibleItems;
    self.visibleItemPositions = visibleItemPositions;

    if (!itemIsVisible(self.selectedItem, self.ul)) {
      self.ul.scrollTop = self.selectedItem.offsetTop;
    }
  };

  // Normally, the ul is rendered below the input.  However, if that would place the ul
  // off the bottom of the viewport, we should render the ul above the input.
  // If it won't fit above or below, default to below.

  TypeaheadDropdown.prototype.positionList = function (input, ul) {
    var self = this,
      inputRect = input.getBoundingClientRect(),
      ulHeight = ul.offsetHeight,
      ulBottom = inputRect.top + inputRect.height + ulHeight, // assumes placement will be below the input
      windowBottom = window.innerHeight;

    // At this point, the ul is rendered at the bottom of the body, so it has a height,
    // but you cannot use its offsetTop.
    // The input is rendered and correctly positioned, so you can use its offsetTop.

    if (
      self.ulPosition !== "above" &&
      (self.ulPosition === "below" ||
        ulBottom <= windowBottom ||
        inputRect.top - ulHeight < 0)
    ) {
      // If we've previously placed the ul below,
      // or if the ul will fit below,
      // or it the ul will not fit above,
      // then place the ul below the input.
      setPosition(
        ul,
        inputRect.bottom,
        inputRect.left,
        inputRect.width - input.clientLeft,
        true
      );
      self.ulPosition = "below";
    } else {
      // put the ul above the input
      setPosition(
        ul,
        inputRect.top - ulHeight,
        inputRect.left,
        inputRect.width - input.clientLeft,
        true
      );
      self.ulPosition = "above";
    }
  };

  var injectStyles = function () {
    // Inject styles into the <head>.  Anything in {{braces}} will be eval'd.
    var self = this,
      styles,
      head = document.head || document.getElementsByTagName("head")[0],
      styleElement = document.createElement("style");

    styles =
      ".{{classNames.hidden}} { \
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
      z-index: 999999; \
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
";

    // update all the {{class names}}
    styles = styles.replace(/{{(.*?)}}/g, function (str) {
      return eval(str);
    });

    styleElement.type = "text/css";
    if (styleElement.styleSheet) {
      style.styleSheet.cssText = styles;
    } else {
      styleElement.appendChild(document.createTextNode(styles));
    }
    head.appendChild(styleElement);
  };

  var itemIsVisible = function (item, ul) {
    if (typeof item === "undefined" || typeof ul === "undefined") return true;
    var ulTop = ul.scrollTop,
      ulBottom = ulTop + ul.clientHeight,
      itemTop = item.offsetTop,
      itemBottom = itemTop + item.offsetHeight;
    return itemTop >= ulTop && itemBottom <= ulBottom;
  };

  var arrayContains = function (arr, val) {
    if (arr.length === 0) return false;
    return arr
      .map(function (x) {
        return x === val;
      })
      .reduce(function (prevVal, currVal) {
        return prevVal || currVal;
      });
  };

  var setPosition = function (elt, top, left, width, allowWider) {
    // position elt and assign width, taking the window's scroll position into account
    var vertScroll =
        window.pageYOffset ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0,
      hortScroll =
        window.pageXOffset ||
        document.documentElement.scrollLeft ||
        document.body.scrollLeft ||
        0;
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
    if (
      typeof className === undefined ||
      className === "" ||
      typeof item === "undefined" ||
      item === null
    )
      return;
    var re = new RegExp("(?:^|\\s)" + className + "(?!\\S)", "gi");
    item.className = item.className.replace(re, "");
  };

  var addClass = function (item, className) {
    if (item.className === "") {
      item.className = className;
    } else {
      if (
        item.className.toLowerCase().indexOf(className.toLowerCase()) === -1
      ) {
        item.className += " " + className;
      }
    }
  };

  var setText = function (elt, text) {
    if (elt.hasOwnProperty("innerText")) {
      elt.innerText = text.trim();
    } else {
      elt.textContent = text.trim();
    }
  };

  var getText = function (elt, text) {
    if (typeof elt === "undefined") return;
    if (elt.hasOwnProperty("innerText")) {
      return elt.innerText.trim();
    } else {
      return elt.textContent.trim();
    }
  };

  var generateId = function (len) {
    var id = "",
      chars = "abcdefghijklmnopqrstuvwxyz";

    for (var i = 0; i < len; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  };

  var cleanUpRemovedDropdown = function (select) {
    var selectId = select.id,
      inputId,
      ulId;

    if (typeof selectId !== "undefined") {
      (inputId = "input-" + namingPrefix + selectId),
        (ulId = "ul-" + namingPrefix + selectId),
        (input = document.getElementById(inputId));
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
          var matches = (this.document || this.ownerDocument).querySelectorAll(
              s
            ),
            i = matches.length;
          while (--i >= 0 && matches.item(i) !== this) {}
          return i > -1;
        };
    }
  };

  // Cross-browser way to convert a nodelist to an array:
  var nodeListToArray = function (nodeList) {
    var myArray = [];
    for (var i = 0; i < nodeList.length; i++) {
      var self = nodeList[i];
      myArray.push(self);
    }
    return myArray;
  };

  // MutationObserver code:
  // This handles any <select>s that are added or removed after the initial call to TypeaheadDropdowns.init().
  // For example, if a page uses AJAX to load a <select>, or if the <options> in a <select> are modified via AJAX,
  // this observer code should handle initializing the TypeaheadDropdown.
  var initObserver = function (dropdownSelector, blacklistSelector) {
    var self = this,
      observerConfig = {
        attributes: false,
        childList: true,
        characterData: false,
        subtree: true,
      };

    var observer = new MutationObserver(function (mutations) {
      var newSelects = [],
        modifiedSelects = [],
        removedSelects = [];

      mutations.forEach(function (mutation) {
        for (var i = 0; i < mutation.addedNodes.length; i++) {
          var n = mutation.addedNodes[i];
          if (n.nodeType != 1) continue; // ignore non-Element nodes

          var childSelects = n.querySelectorAll(dropdownSelector);
          var blacklistSelects = nodeListToArray(
            n.querySelectorAll(blacklistSelector)
          );

          if (n.matches(dropdownSelector) && !n.matches(blacklistSelector)) {
            newSelects.push(n);
            observer.observe(n, observerConfig);
          } else if (childSelects.length > 0) {
            for (var j = 0; j < childSelects.length; j++) {
              if (blacklistSelects.includes(childSelects[j])) continue;
              newSelects.push(childSelects[j]);
              observer.observe(childSelects[j], observerConfig);
            }
          } else if (n.tagName.toLowerCase() === "option") {
            if (!arrayContains(modifiedSelects, n.parentNode)) {
              if (blacklistSelects.includes(n.parentNode)) continue;
              modifiedSelects.push(n.parentNode);
            }
          }
        }

        // if an ancestor of a <select> is removed, we are not currently detecting that
        for (var i = 0; i < mutation.removedNodes.length; i++) {
          var n = mutation.removedNodes[i];
          if (typeof n.tagName === "undefined") continue;
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
    var blacklistSelects = nodeListToArray(
      document.querySelectorAll(blacklistSelector)
    );
    for (var i = 0; i < selectNodes.length; i++) {
      if (blacklistSelects.includes(selectNodes[i])) continue;
      observer.observe(selectNodes[i], observerConfig);
    }
  };

  var initFromNode = function (node) {
    if (node.tagName.toLowerCase() !== "select") return;
    (function () {
      new TypeaheadDropdown(node);
    })();
  };

  var init = function (dropdownSelector, blacklistSelector) {
    // dropdownSelector = a CSS selector for the <select> elements that we want to turn into typeahead dropdowns.
    // blacklistSelector = a CSS selector for elements that we do NOT want to turn into typeaheads, even if they match dropdownSelector.
    // Both of these are optional.  By default, all <select> elements will become typeaheads.

    if (_initialized) return;

    // If MutationObserver is not defined, silently do nothing.  Users will see regular dropdowns.
    if (MutationObserver) {
      dropdownSelector = dropdownSelector || "select"; // update all selects by default

      initObserver(dropdownSelector, blacklistSelector);

      injectStyles();

      loadPolyfills();

      var selects = document.querySelectorAll(dropdownSelector);
      var blacklistedSelects = nodeListToArray(
        document.querySelectorAll(blacklistSelector)
      );

      for (var i = 0; i < selects.length; i++) {
        if (selects[i].tagName.toLowerCase() !== "select") {
          console.log(
            "The selector passed to TypeaheadDropdowns.init() should only include <select> elements.  Skipping: " +
              selects[i].tagName
          );
          continue;
        }
        if (blacklistedSelects.includes(selects[i])) continue;
        new TypeaheadDropdown(selects[i]);
      }
    } else {
      console.log(
        "TypeaheadDropdowns cannot be initialized, because this browser does not support the MutationObserver API."
      );
    }

    _initialized = true;
  };

  // export public methods
  return {
    init: init,
    initFromNode: initFromNode,
  };
})();

// Don't forget to call this on the page where you are including this file:
// TypeaheadDropdowns.init(); // you can pass a selector like "select.typehead" if you only want to modify certain <select> elements.
