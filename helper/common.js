import randomstring from "randomstring";
function generateOTP() {
  const OTP_LENGTH = 4;
  return randomstring.generate({
    length: OTP_LENGTH,
    charset: "numeric",
  });
}

export function getContactInfo(name) {
  const socialMediaInfo = {
    deepak: {
      number: "9873246272",
      email: "deepak@hivoco.com",
    },
    ann: {
      number: "8851260538",
      email: "ann@hivoco.com",
    },
    dipanshi: {
      number: "8252261004",
      email: "kritika@hivoco.com",
    },
    kritika: {
      number: "8252261004",
      email: "kritika@hivoco.com",
    },
    malvika: {
      number: "8826868930",
      email: "malvika@hivoco.com",
    },
    pritesh: {
      number: "8285022022",
      email: "pritesh@hivoco.com",
    },
    rachita: {
      number: "+17373305684",
      email: "rachita@hivoco.com",
    },
  };
  const lowerCaseName = name.toLowerCase();
  if (socialMediaInfo[lowerCaseName]) {
    return socialMediaInfo[lowerCaseName];
  } else {
    return {
      number: "9873246272",
      email: "deepak@hivoco.com",
    };
  }
}
export default generateOTP;

