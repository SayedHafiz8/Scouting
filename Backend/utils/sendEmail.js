import nodeMailer from "nodemailer";

const sendEmail = async(options) =>{
    const transporter = nodeMailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        secure: true,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    const mailOpts = {
        from: `TalentRader App <${process.env.EMAIL_USER}>`,
        to: options.email,
        subject: options.subject,
        html: options.message
    }

    await transporter.sendMail(mailOpts)
}

export default sendEmail