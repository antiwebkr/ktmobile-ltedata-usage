"use strict";

const tesseract = require("node-tesseract");
const fs = require("fs");
const setCookie = require("set-cookie-parser");
const cheerio = require("cheerio");
const cronJob = require("cron").CronJob;
const {get, post} = require("request");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.186 Safari/537.36 OPR/51.0.2830.55";
const fcm_key = "YOUR FCM KEY";
const USERINFO = {
	ID: "USER ID",
	PW: "USER PASSWORD"
};
let headers = {
	"User-Agent": UA,
	"Referer": "https://www.ktmmobile.com/loginForm.do"
};

const getIndex = () => new Promise((resolve, reject) => {
	get({
		url: "https://www.ktmmobile.com/loginForm.do",
		headers: {
			"User-Agent": UA,
			"Referer": "https://www.ktmmobile.com/main.do"
		},
		encoding: null
	}, (err, res, html) => err ? reject(err) : resolve(res));
});

const downloadCaptcha = () => new Promise((resolve, reject) => {
	get({
		url: `https://www.ktmmobile.com/CaptChaImg.do?rand=${Math.random()}`,
		headers: {
			"User-Agent": UA,
			"Cookie": headers["Cookie"],
			"Referer": "https://www.ktmmobile.com/loginForm.do"
		},
		encoding: null
	}, (err, res, html) => err ? reject(err) : resolve(Buffer.from(html, 'utf8')));
});

const ocr = () => new Promise((resolve, reject) => {
	tesseract.process(exec["IMAGE"]["PATH"], (err, text) => err ? reject(err) : resolve(text));
});

const fcm_send = (form) => {
    return new Promise((resolve, reject) => {
            post({
                    url: "https://fcm.googleapis.com/fcm/send",
                    method: "POST",
                    headers: {
                            "Content-Type": "application/json",
                            "Authorization": `key=${fcm_key}`
                    },
                    json: form
            }, (err, res, html) => {
                    process.exit(1);
            });
    });
}

const main = async() => {
	let exec = {
		INDEX: {},
		IMAGE: {
			"PATH": "./capthca.png"
		}
	};

	try {
		exec["INDEX"]["RESPONSE"] = await getIndex();

		exec["INDEX"]["COOKIE"] = setCookie.parse(exec["INDEX"]["RESPONSE"], {decodeValues: true});

		// SESSION COOKIE SET
		exec["COOKIE_TMP"] = "";

		for(let setcookie of exec["INDEX"]["COOKIE"])
			exec["COOKIE_TMP"] += `${setcookie["name"]}=${setcookie["value"]}; `;

		headers["Cookie"] = exec["COOKIE_TMP"];

		// CAPTCHA DOWNLOAD
		exec["IMAGE"]["DATA"] = await downloadCaptcha();
		
		// CAPTCHA SAVE
		exec["IMAGE"]["RETURN"] = await new Promise((resolve, reject) => {
			fs.writeFile(exec["IMAGE"]["PATH"], exec["IMAGE"]["DATA"], (err) => err ? reject(err) : resolve(true));
		});

		// CAPTCHA OCR 
		exec["OCR"] = (await new Promise((resolve, reject) => {
			tesseract.process(exec["IMAGE"]["PATH"], (err, text) => err ? reject(err) : resolve(text));
		})).slice(0, -2);		

		// CAPTCHA 
		exec["CAPTCHA"] = await new Promise((resolve, reject) => {
			post({
				url: "https://www.ktmmobile.com/isBirthGenderAjax.do",
				headers: headers,
				form: {
					checkValue: "",
					referer: "",
					uri: "/main.do",
					timer: 0,
					birthday: "",
					mapping: "/loginForm.do",
					userId: USERINFO["ID"],
					passWord: USERINFO["PW"],
					answer: exec["OCR"]
				}
			}, (err, res, html) => err ? reject(err) : resolve(html));
		});

		// LOGIN 
		exec["LOGIN"] = await new Promise((resolve, reject) => {
			post({
				url: "https://www.ktmmobile.com/loginProcess.do",
				headers: headers,
				form: {
					checkValue: "",
					referer: "",
					uri: "/main.do",
					timer: 0,
					birthday: "",
					mapping: "/loginForm.do",
					userId: USERINFO["ID"],
					passWord: USERINFO["PW"],
					answer: exec["OCR"]
				}
			}, (err, res, html) => err ? reject(err) : resolve(res));
		});

		// LOGIN COOKIE SET
		exec["LOGIN_COOKIE"] = setCookie.parse(exec["LOGIN"], {decodeValues: true});
		exec["COOKIE_TMP"] = "";

		for(let setcookie of exec["LOGIN_COOKIE"])
			exec["COOKIE_TMP"] += `${setcookie["name"]}=${setcookie["value"]}; `;

		headers["Cookie"] = exec["COOKIE_TMP"];

		// USAGE GET
		exec["USAGE"] = await new Promise((resolve, reject) => {
			get({
				url: "https://www.ktmmobile.com/mypage/callView01.do",
				headers: headers
			}, (err, res, html) => err ? reject(err) : resolve(html));
		});

		const $ = cheerio.load(exec["USAGE"]);

		exec["LTE"] = {
			LEFT: $(".mypage_using_search ul:last-child .width_40").text(),
			USE: $(".mypage_using_search ul:last-child .width_33").text()
		};

		// FCM 보내기
		exec["FCM"] = await fcm_send({
			notification: {
				title: "데이터 사용량",
				text: `${exec["LTE"]["USE"]}\n${exec["LTE"]["LEFT"]}`,
				sound: 'beep'
			},
			to: '/topics/all'
		});
		return;
	} catch(err) {
		console.error(err);
		return;
	}
};

new cronJob("00 00 06 * * *", () => main(), null, true, "Asia/Seoul");
