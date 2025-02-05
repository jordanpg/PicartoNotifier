if (chrome) {
	storage = chrome.storage;
	tabs = chrome.tabs;
	notifications = chrome.notifications;
	cookies = chrome.cookies;
	browser = chrome;
}
function isDevMode() {
    return !('update_url' in browser.runtime.getManifest());
}

var motd = "Added OAuth override, fixed some minor stuff";

var livecount = 0;
var invitecount = 0;
var ownname = "";
var exploreData = {};
var notifications = 0;
var knownAvatars = {};

var notloggedinrecall = false;

var token = "";
var cookieToken = "";

var picartoClientID = "6deb707e-1253-4149-be70-73809ef68264"
var redirectURI = "https://jordanpg.github.io/picarto/redirect.html"
var crxID = "jehmkkfdlegnihglnkcjhanlnjgefjfo"
var picartoURL = "https://oauth.picarto.tv/authorize?redirect_uri=" + redirectURI + "&response_type=token&scope=readpub readpriv write&state=OAuth2Implicit&client_id=" + picartoClientID
var tokenRegex = RegExp("[&#]access_token=(.+?)(?:&|$)")
const apiUrl = 'https://api.picarto.tv/api/v1/';
// const apiUrl = 'https://api.picarto.tv/v1/'

function IsNullOrWhitespace( input ) {
  return !input || !input.trim();
}

function fetchCookieToken()
{
	chrome.cookies.get({
		url: "http://picarto.tv",
		name: "ptv_auth"
	}, data => {
		cookie = JSON.parse(data.value)
		cookieToken = cookie["access_token"];
		console.log(cookie);
	})
}

function OAuthConnect(interactive = false, callback) {
	console.log("Parsing oauth...");
	console.log("Redirect URI: " + redirectURI);
	browser.identity.launchWebAuthFlow({'url': picartoURL,'interactive': interactive}, (redirect_url) => {
		let parsed = tokenRegex.exec(redirect_url);
		console.log("Redirect received! Parsing...");
		if (parsed) {
			console.log("Logged in!");
			token = parsed[1];
			storage.local.set({"OAUTH" : token});
			
			typeof callback === 'function' && callback();
		} else {
			token = "";
			console.group("OAuth2 Failed:");
			console.log(redirect_url);
			console.log(parsed);
			console.groupEnd();
			typeof callback === 'function' && callback();
		}
	});
}


async function getAPI(url, callback) {
	try {
		await $.ajax({
			url: apiUrl + url,
			method: "GET",
			dataType: "json",
			crossDomain: true,
			contentType: "application/json; charset=utf-8",
			cache: true,
			beforeSend: function (xhr) {
				xhr.setRequestHeader("Authorization", "Bearer " + token);
			},
			success: function (data) {
				/* console.log("woo!"); */
				
				typeof callback === 'function' && callback(data);
			},
			error: function (jqXHR, textStatus, errorThrown) {
				console.log(jqXHR.responseText);
			}
		});
	} catch (e) {
		//
	}
}

async function postAPI(url, callback) {
	await $.ajax({
		url: apiUrl + url,
		method: "POST",
		crossDomain: true,
		contentType: "application/json; charset=utf-8",
		cache: true,
		beforeSend: function (xhr) {
			xhr.setRequestHeader("Authorization", "Bearer " + token);
		},
		success: function (data) {
			/* console.log("woo!"); */
			
			typeof callback === 'function' && callback(data);
		},
		error: function (jqXHR, textStatus, errorThrown) {
			console.log(textStatus);
			console.log(errorThrown);
		}
	});
}

async function getAvatar(name)
{
	return new Promise((resolve, reject) => {
		try
		{
			getAPI(`channel/name/${name}`, data => {
				let avatarUrl = data.avatar;
				if(!avatarUrl)
				{
					reject();
					return;
				}

				if(avatarUrl === knownAvatars[name])
				{
					resolve(avatarUrl);
					return;
				}

				knownAvatars[name] = avatarUrl;
				storage.local.set({"AVATAR": knownAvatars}, () => {
					if(isDevMode()) console.log(`Avatar for ${name}: ${avatarUrl}`);

					resolve(avatarUrl);
				});
			});
		}
		catch
		{
			reject();
		}
	});
}

// download Picarto page to reload session
function loggedintest() {
	if (isDevMode()) {
		console.log("Pulling Picarto page...");
	}
	$.ajax({
		url: "https://picarto.tv/settings/multistream",
		success: function(data) {
			
			$.post("https://picarto.tv/process/explore", {follows: true}).done(function(data) {
				exploreData = JSON.parse(data);
				if (exploreData[0] && exploreData[0].error == "notLoggedin") {
					if (isDevMode()) {
						console.log("Yup, user is not logged in!");
					}
					storage.local.clear();
					storage.local.set({"USERNAME" : false});
				}
			});
		},
		error: function() {
			console.log("Whoops. AJAX on Picarto failed!");
		}
	});
	notloggedinrecall = true;
}

function notify(name, type) {
	
	if (type == "live") {
		if (settings["notifications"] == true) {	
			getAPI(`channel/name/${name}`, data => {
				browser.notifications.create(name, {
					type: "basic",
					iconUrl: data.avatar,
					title: "Currently streaming on Picarto:",
					message: name
				}, function() {});
				if (settings["alert"] == true) {
					ding.play();
				}
			});								
		}
	}
}

function updateLive(callback) {
	
	livecount = 0;
	let cleanData = {};
	
	// fetch from storage and update cache
	storage.local.get("LIVE", async function(items) {
		
		let livecache = items["LIVE"];
	
		// loop through cached users to update for removal
		for (u in livecache) {
			
			let name = u; // saved with key rather than index
			let user = livecache[u]; // the actual stored object
			
			user["live"] = false;
			
			// compare with newly pulled data
			for (i in exploreData) {
				
				// got a match! cache will be updated and name will be remembered
				if (exploreData[i].name && name === exploreData[i].name) {
					
					exploreData[i]["old"] = true;
					user["live"] = true;
					
					/* continue; */
				}
			}
			
			// user no longer online
			if (!user["live"]) {
				
				// remove user from cache
				delete livecache[u]
				if (isDevMode()) {
					console.log("User '" + name + "' no longer online (removed from cache)");
				}
			}
		}
		
		// add the remaining users and dispatch notifications
		for (i in exploreData) {
			
			let name = exploreData[i].name;
			let user = exploreData[i];
			
			cleanData[name] = user;
			
			// new user online
			if (!user["old"]) {
				if (isDevMode()) {
					console.log(name + " just started streaming!");
				}
				
				getAvatar(name);
				// dispatch live notification (or not)
				notify(name, "live");
			}
		}
		
		livecount = Object.keys(cleanData).length;
		
		browser.storage.local.set({"LIVE" : cleanData}, function() {
			typeof callback === 'function' && callback();
		});	
	});
}

function updateAPI(callback) {
	
	storage.local.get(["OAUTH"], (data) => {
		if (data["OAUTH"]) {
			token = data["OAUTH"];
			if (token.indexOf(' ') != -1) {
				token = token.substr(token.indexOf(' ') + 1);
				storage.local.set({"OAUTH" : token});
			}
			if (IsNullOrWhitespace(token)) {
				token = "";
				storage.local.remove("OAUTH");
			}
		}
		if (token) {
			storage.local.get(["CACHESTAMP"], (data) => {
				if (data["CACHESTAMP"] && Date.now() < data["CACHESTAMP"] + 15000) {
					//
				} else {
					getAPI("user", function(a) {
						storage.local.set({"API_USER" : a});
						storage.local.set({"USERNAME" : a["channel_details"]["name"]});
					});
					getAPI("user/notifications", function(c) {
						if (c)
							notifications = c.length;
						else
							notifications = 0;
						
						storage.local.set({"API_NOTIFICATIONS" : c});

						for(notif of c)
							getAvatar(notif.channel);
						
						// automatically remove notifications if setting is enabled
						if (settings["picartobar"] == true && c && c[0]) {
							for (n in c) {
								postAPI("user/notifications/" + c[n]["uuid"] + "/delete");
							}
							c = {};
							storage.local.set({"API_NOTIFICATIONS" : c});
							notifications = 0;
						}
						
					});
				}
			});
			getAPI("user/multistream", function(b) {
				if (b["incoming"])
					invitecount = b["incoming"].length;
				else
					invitecount = 0;
				storage.local.set({"API_MULTISTREAM" : b});
			});
		}
		updateBadge();
	});
	typeof callback === 'function' && callback();
}

function updateBadge(callback) {
	browser.browserAction.setBadgeBackgroundColor( { color: settings["badgecolor"]} );
			
	var badgetext = "";
	var badgetooltip = "";
	
	if(settings["badgenotif"] == true) {
		if (notifications == 1) {
			badgetext = "1";
			badgetooltip = "1 person streaming";
		} else if (notifications > 1) {
			badgetext = notifications.toString();
			badgetooltip = notifications.toString() + " notifications";
		} else {
			var badgetext = "";
			var badgetooltip = "";
		}
		browser.browserAction.setBadgeText({"text": badgetext});
		browser.browserAction.setTitle({"title": badgetooltip});
	}
	else {
		if (settings["streamer"] == true) {
			
			if (livecount == 1) {
				badgetext = "1";
				badgetooltip = "1 person streaming";
			} else if (livecount > 1) {
				badgetext = livecount.toString();
				badgetooltip = livecount.toString() + " people streaming";
			} else {
				badgetext = "";
				badgetooltip = "";
			}
			if (livecount > 0) {
				if (invitecount == 1) {
					badgetext = badgetext + ", 1";
					badgetooltip = badgetooltip + ", 1 invite";
				} else if (invitecount > 1) {
					badgetext = badgetext + ", " + invitecount.toString();
					badgetooltip = badgetooltip + ", " + invitecount.toString() + " invites";
				}
			}
			else {
				if (invitecount == 1) {
					badgetext = "1";
					badgetooltip = "1 invite";
				} else if (invitecount > 1) {
					badgetext = invitecount.toString();
					badgetooltip = invitecount.toString() + " invites";
				}
			}
			browser.browserAction.setBadgeText({"text": badgetext});
			browser.browserAction.setTitle({"title": badgetooltip});
		}
		else {		
			if (livecount == 1) {
				badgetext = "1";
				badgetooltip = "1 person streaming";
			} else if (livecount > 1) {
				badgetext = livecount.toString();
				badgetooltip = livecount.toString() + " people streaming";
			} else {
				badgetext = "";
				badgetooltip = "";
			}
			browser.browserAction.setBadgeText({"text": badgetext});
			browser.browserAction.setTitle({"title": badgetooltip});
		}
	}
	
	
	
	typeof callback === 'function' && callback();
}

function updateMOTD() {
	
	let version = browser.runtime.getManifest().version;	
	if (settings["updatemsg"]) {
		storage.sync.get(["MOTD"], (data) => {
			if ((data["MOTD"] && data["MOTD"] != "" && data["MOTD"].split('.').slice(0,2).join(".") != version.split('.').slice(0,2).join(".")) || !data["MOTD"] || data["MOTD"] == "") {
				browser.notifications.create("MOTD", {
					type: "basic",
					iconUrl: "icons/icon128.png",
					title: "Picarto Notifier updated to " + version.toString().substr(0, 3) + "!",
					message: motd
				}, function() {});
			}
			storage.sync.set({"MOTD" : version});
		});
	}
	else
		storage.sync.set({"MOTD" : version});
}

// main update function
function update() {
	if(isDevMode())
		console.log("Updating...");

	getAPI("online?adult=true&gaming=true", data => {
	// $.get("https://api.picarto.tv/v1/online", {follows: true, first: 1000}).done(function(exploreData) {
		// if(isDevMode()) console.log(data);

		exploreData = data.filter(channel => channel['following']);

		if(isDevMode()) console.log(data, exploreData);
		// exploreData = JSON.parse(data);
		
		// check user session
		if (exploreData[0] && exploreData[0].error == "notLoggedin") {
			if (isDevMode()) {
				console.log("User is not logged in!");
			}
			if (notloggedinrecall == false) {
				loggedintest();
			}
			else {
				//
			}
		}
		else {
			notloggedinrecall = false;
			/* storage.local.set({"USERNAME" : ""}); */
			updateLive(()=>{
				updateAPI(()=>{
					updateBadge(()=>{
						updateMOTD();
						// done!
					})
				})
			})
		}
	});
}

// get default settings or fetch from storage
let defaults = {
	"notifications" : true,
	"alert" : false,
	"streamer" : false,
	"picartobar" : false,
	"badgenotif" : false,
	"updatemsg" : true,
	"badgecolor" : "#33aa33",
	"markup" : true,
	"maxmsg" : "0",
	"fullscreenfix" : false,
	"expandstrm" : true,
	"norefer" : true
};

var settings = {};
settings = $.extend(true, {}, defaults);
var updater;

function getSettings() {
	storage.sync.get(["SETTINGS"], (data) => {
		for (let a in data["SETTINGS"]) {
			let setting = data["SETTINGS"][a];
			settings[a] = setting;
		}
		storage.local.get(["OAUTH"], (data) => {
			if (data["OAUTH"])
				token = data["OAUTH"];
			
			// start the update!
			update();
			updater = setInterval(update, 300000);
		});

		storage.local.get("AVATAR", data => {
			if(data["AVATAR"])
				knownAvatars = data["AVATAR"];
		});
	});
}

function restart() {
	clearInterval(updater);
	settings = $.extend(true, {}, defaults);
	getSettings()
}

getSettings();

// create audio alert object
var ding = new Audio('audio/ding.ogg');

// add listener to the desktop notification popups
browser.notifications.onClicked.addListener(function(notificationId) {
	if (notificationId !== "MOTD") {
		if (isDevMode()) {
			console.log("Notification clicked! ID: " + notificationId);
		}
		window.open('https://picarto.tv/' + notificationId, '_blank');
		browser.notifications.clear(notificationId, function() {});
	}
});

// listen for messages from other pages
browser.runtime.onMessage.addListener(
	function(request, sender, sendResponse) {
		switch (request.message) {
		case "setCount":
			setCount(request.count);
			break
		case "settingChanged":
			if (isDevMode()) {
				console.log("Settings updated!");
			}
			for (s in request) {
				if (s != "message") {
					settings[s] = request[s];
				}
			}
			restart();
			break
		case "updateAll":
			restart();
			break
		case "purgeAll":
			settings = {};
			livecount = 0;
			invitecount = 0;
			ownname = "";
			exploreData = {};
			notloggedinrecall = false;
			token = "";
			restart();
			break;
		case "notificationRemoved":
			notifications -= 1;
			updateBadge();
			break;
		case "oauth":
			OAuthConnect(true, function() {
				browser.browserAction.getBadgeText({}, function(result) {
					sendResponse("OK");
				});
			});
			return true;
		case "getBadgeText":
			if (isDevMode()) {
				console.log("getBadgeText");
			}
			browser.browserAction.getBadgeText({}, function(result) {
				sendResponse(result);
			});
			return true;
		}
		return false;
	}
);