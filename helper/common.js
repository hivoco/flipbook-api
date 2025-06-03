import randomstring from "randomstring";
function generateOTP() {
  const OTP_LENGTH = 4;
  return randomstring.generate({
    length: OTP_LENGTH,
    charset: "numeric",
  });
}

export default generateOTP;
