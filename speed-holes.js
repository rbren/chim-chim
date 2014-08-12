var SpeedHoles = {};

var BASE_URL = "http://www.bbrennan.info:3000/";

var EXTENSION_MODE = 1;
var PREFETCH_CLASS = "pfpf";
var COOKIE_NAME = "pf-session-id";
var SESSION_TIMEOUT_MS = 10 * 1000 * 60;
var INITIALIZE_WAIT_TIME_MS = 1 * 1000;

var LOAD_HOOKS = [
  "navigationStart",
  "fetchStart",
  "domainLookupStart",
  "domainLookupEnd",
  "connectStart",
  "connectEnd",
  "requestStart",
  "responseStart",
  "responseEnd",
  "domLoading",
  "domInteractive",
  "domComplete",
  "loadEventStart",
  "loadEventEnd"
];

var printLoadTimes = function(timing) {
  for (var i = 0; i < LOAD_HOOKS.length - 1; ++i) {
    var time = timing[LOAD_HOOKS[i+1]] - timing[LOAD_HOOKS[i]];
    console.log(LOAD_HOOKS[i+1] + " - " + LOAD_HOOKS[i] + " = " + time);
    //var time = timing[LOAD_HOOKS[i]];
    //console.log(LOAD_HOOKS[i] + ":" + time);
  }
}

var mLandingPage = {};
var mHostname;
var mCandidates = [];
var mAssetLatencies = {};
var mInitialized = false;
var mIneligible = false;

var mPrefetchNum = 0;
var getNextPrefetchId = function() {
  return "pf-" + mPrefetchNum++;
}

var cacheLinks = function(links, onFetchCallback) {
  getCacheableLinks(links, function(cacheables) {
    console.log("got all cacheable links:" + cacheables.length);
    //addIFrames(cacheables);
  }, function(cacheableLink) {
    addToPrefetch(cacheableLink);
    addToPrerender(cacheableLink);
    addToXhrCache(cacheableLink);
    addToIFrameCache(cacheableLink, function() {
      if (OPTIONS["markFetchedLinks"]) {
        markLink(cacheableLink);
      }
      onFetchCallback(cacheableLink);
    });
  });
}

var getCacheableLinks = function(links, onDone, onCacheable) {
  if (!links) {
    onDone(links);
    return;
  }
  // Get unique links
  links = links.filter(function(value, index, self) {
    return self.indexOf(value) === index;
  });
  if (!OPTIONS["checkIfCacheable"]) {
    for (var i = 0; i < links.length; ++i) {
      onCacheable(links[i]);
    }
    onDone(links);
    return;
  }
  var cacheableLinks = [];
  var maxToCheck = OPTIONS["maxLinks"] * 3;
  var checkNext = function(linklist, index, doNext, onFinish) {
    checkIfCacheable(linklist[index], function(cacheable) {
      if (cacheable) {
        onCacheable(linklist[index]);
        cacheableLinks.push(linklist[index]);
      }
      if (++index < linklist.length &&
          index < maxToCheck &&
          cacheableLinks.length < OPTIONS["maxLinks"]) {
        doNext(linklist, index, doNext, onFinish)
      } else {
        onFinish();
      }
    })
  }
  checkNext(links, 0, checkNext, function() {
    onDone(cacheableLinks);
  });
}

var checkIfCacheable = function(url, onCheck) {
  if (url === document.location.href) {
    onCheck(false);
    return;
  }
  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function() {
    if (this.readyState === this.DONE) {
      var cacheOpts = xhr.getResponseHeader("Cache-Control");
      cacheOpts = cacheOpts ? cacheOpts.toLowerCase() : ""
      if (cacheOpts.indexOf('no-cache') !== -1 ||
          cacheOpts.indexOf('max-age=0') !== -1 ||
          // TODO: hacks?
          cacheOpts.indexOf('s-maxage') !== -1 ||
          cacheOpts.indexOf('private') !== -1) {
        onCheck(false);
      } else {
        onCheck(true);
      }
    }
  }
  xhr.open('HEAD', url);
  xhr.send('');
}

var addToPrefetch = function(url) {
  if (OPTIONS["disablePrefetch"]) {return;}
  var id = getNextPrefetchId();

  $("body").append($('<link>')
    .attr('id', id)
    .attr('rel', "prefetch")
    .attr('class', PREFETCH_CLASS)
    .attr('href', url)
  );
}

var addToPrerender = function(url) {
  if (OPTIONS["disablePrerender"]) {return;}
  var id = getNextPrefetchId();
  $("body").append($('<link>')
    .attr('id', id)
    .attr('rel', "prerender")
    .attr('class', PREFETCH_CLASS)
    .attr('href', url)
  );
}

var addIFrames = function(links) {
  if (OPTIONS["disableIFrameCache"]) {return;}
  var addNextToIFrame = function(linkset, index, onDone) {
    addToIFrameCache(linkset[index], function(){
      if (++index < linkset.length) {
        onDone(linkset, index, onDone);
      }
    });
  };
  addNextToIFrame(links, 0, addNextToIFrame)
}

var addToIFrameCache = function(url, onDone) {
  if (OPTIONS["disableIFrameCache"]) {
    onDone();
    return;
  }
  var id = getNextPrefetchId();

  $("body").append($('<iframe>')
    .attr('id', id)
    .attr('src', url)
    .attr('class', PREFETCH_CLASS)
    .load(function() {
      console.log("loaded iframe " + url);
      onDone();
    })
    .hide()
  );
}

var addToXhrCache = function(url) {
  if (OPTIONS["disableXhrCache"]) {return;}
  console.log("add to xhr:" + url);
  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function() {
    if (this.readyState == this.DONE) {
      markLink(url);
    }
  }
  xhr.open('GET', url);
  xhr.send('')
}

var setSessionCookie = function(sessionId) {
  console.log("setting new session:" + sessionId);
  mSessionId = sessionId;
  console.log('cookie1:' + document.cookie);
  var time = new Date(new Date().getMilliseconds() + SESSION_TIMEOUT_MS);
  document.cookie = COOKIE_NAME + "=" + sessionId + "; expires " + time.toUTCString() + "; path=/";
  console.log('cookie2:' + document.cookie);
}

var getSessionCookie = function() {
  var cookies = document.cookie.split(";");
  for (var i = 0; i < cookies.length; ++i) {
    var cookie = cookies[i];
    while (cookie.charAt(0) === ' ') {cookie = cookie.substring(1, cookie.length);}
    if (cookie.indexOf(COOKIE_NAME + "=") === 0) {
      console.log("found cookie:" + cookie);
      return cookie.substring(COOKIE_NAME.length + 1, cookie.length);
    }
  }
  return "";
}

var markLinks = function(links) {
  for (var i = 0; i < links.length; ++i) {
    markLink(links[i]);
  }
}

var markLink = function(link) {
  console.log("marked:" + link);
  $("a[href='" + link + "']").css('background-color', '#FF0000');
}

var setOptions = function(opts) {
  if (!opts["prerenderingConfidence"]) {
    opts["prerenderingConfidence"] = -1;
  }
  if (!opts["requestTimeout"]) {
    opts["requestTimeout"] = 150;
  }
  if (!opts["confidenceThreshold"]) {
    opts["confidenceThreshold"] = 0.0;
  }
  if (!opts["maxLinks"]) {
    opts["maxLinks"] = 10;
  }
  if (!opts["userid"]) {
    // Implicitly anonymous
  }
  if (typeof opts["disablePrerender"] === undefined) {
    opts["disablePrerender"] = false;
  }
  if (typeof opts["disablePrefetch"] === undefined) {
    opts["disablePrefetch"] = false;
  }
  if (typeof opts["disableIFrameCache"] === undefined) {
    opts["disableIFrameCache"] = true;
  }
  if (typeof opts["disableXhrCache"] === undefined) {
    opts["disableXhrCache"] = true;
  }
  if (typeof opts["forceEnabled"] === undefined) {
    opts["forceEnabled"] = false;
  }
  if (typeof opts["forceDisabled"] === undefined) {
    opts["forceDisabled"] = false;
  }
  if (typeof opts["markFetchedLinks"] === undefined) {
    opts["markFetchedLinks"] = false;
  }
  OPTIONS = opts;
}

var constructUri = function(url) {
  var l = document.createElement("a");
  l.href = url;
  return l;
}

var isValidUrl = function(url) {
  if (!url || url.length == 0) {
    return false;
  }
  // TODO: consolidate w/ server logic
  var uri = constructUri(url);
  return uri.protocol == "http:" &&
    uri.search == "" &&
    uri.hash == "" &&
    uri.hostname == mHostname;
}

SpeedHoles.initialize = function(opts, onDone) {
  if (window.self !== window.top || document.webkitHidden) {
    console.log("Not in the top window (e.g. inside an iFrame), not running SpeedHoles.")
    mIneligible = true;
    onDone(1);
    return;
  }

  if (location.protocol === 'https:') {
    console.log("Page is running over https. Not running SpeedHoles.");
    mIneligible = true;
    onDone(2);
    return;
  }

  setOptions(opts);

  if (OPTIONS["disablePrerender"] &&
      OPTIONS["disablePrefetch"] &&
      OPTIONS["disableIFrameCache"] &&
      OPTIONS["disableXhrCache"]) {
    console.log("No prefteching options enabled. Will only check latency numbers.");
    mIneligible = true;
  }

  var timing = performance.timing;
  var latency = timing.responseStart - timing.fetchStart;
  var loadTime = timing.loadEventEnd - timing.responseEnd;
  var loadStats = {
    latency: latency,
    loadTime: loadTime,
    location: mLandingPage.url,
  };

  mLandingPage = {};
  mLandingPage["url"] = document.URL;
  mLandingPage["latency"] = latency;
  mLandingPage["cached"] = false; // TODO: fix.

  mHostname = constructUri(document.URL).hostname;

  var pe = performance.getEntries();
  for (var i = 0; i < pe.length; i++) {
      mAssetLatencies[pe[i].name] = pe[i].duration;
      console.log("name:" + pe[i].name);
  }

  printLoadTimes(timing);

  mSessionId = getSessionCookie();
  console.log("session:" + mSessionId);
  mInitialized = true;
  onDone(false, loadStats);
}

SpeedHoles.addAsset = function(url) {
  if (mIneligible) {return;}
  url = constructUri(url).href;
  if (!isValidUrl(url)) {
    console.log("invalid url:" + url);
    return false;
  }
  console.log("pushed:" + mAssetLatencies[url]);

  var latency = url === mLandingPage.url ? mLandingPage.latency
   : typeof mAssetLatencies[url] !== "undefined" ? mAssetLatencies[url]
   : -1;
  if (latency == -1) {
    console.log("couldn't get latency for asset:" + url);
    return false;
  }
  console.log("register:" + url);
  // TODO: fix cached hard code

  mCandidates.push({url:url, latency: Math.floor(latency), cached: true});
  return true;
}

SpeedHoles.addAssets = function(elems) {
  if (mIneligible) {return;}
  console.log("Adding " + elems.length + " SpeedHoles candidates");
  elems.each(function() {
    var url = $(this).prop("src");
    SpeedHoles.addAsset(url);
  });
}

SpeedHoles.run = function(onFetchCallback) {
  if (mIneligible) {return;}
  if (!mInitialized) {
    throw "SpeedHoles not initialized yet!";
  }
  if (mCandidates.length < 1) {
    console.log("No valid candidates added, SpeedHoles bailing out.");
    return;
  }
  console.log("run!");
  var thresh = OPTIONS["confidenceThreshold"];
    $.ajax(BASE_URL + "referral", {
    data: JSON.stringify({
      referrer: document.referrer,
      assets: mCandidates,
      landingPage: mLandingPage,
      confidence: thresh,
      noFetch: [],
      maxLinks: OPTIONS["maxLinks"],
      /*
      forceEnabled: OPTIONS["forceEnabled"],
      forceDisabled: OPTIONS["forceDisabled"],
      userid: OPTIONS["userid"],
      sessionId: mSessionId
      */
    }),
    contentType : 'application/json',
    type : 'POST',
    success: function(data) {
      console.log("got back data:" + data);
      data = JSON.parse(data);
      var links = data["links"];
      cacheLinks(links, onFetchCallback)
      console.log("msg:" + data["message"]);
    },
    error: function() {
      console.log("err.");
    }
  });
}
