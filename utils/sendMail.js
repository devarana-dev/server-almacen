const { Resend } = require('resend');
const Bottleneck = require('bottleneck');
const fs = require('fs').promises;
const path = require('path');

const resend = new Resend(process.env.RESEND_API_KEY);

const limiter = new Bottleneck({
    maxConcurrent: 1,
    minTime: 2000
});

const from = `Devarana <${process.env.EMAIL_FROM ?? 'noreply@devarana.mx'}>`;

const prepareAttachment = async (attachment) => {

    // Si ya viene contenido directamente
    if (attachment.content) {
        return {
            filename: attachment.filename,
            content: attachment.content,
            ...(attachment.cid && { contentId: attachment.cid })
        };
    }

    // Compatibilidad con tus attachments actuales de Nodemailer
    if (attachment.path) {

        const filePath = path.resolve(process.cwd(), attachment.path);
        const content = await fs.readFile(filePath);

        return {
            filename: attachment.filename || path.basename(filePath),
            content,
            ...(attachment.cid && { contentId: attachment.cid })
        };
    }

    return attachment;
};


const mailSender = (
    to,
    subject,
    html,
    extraAttachments = [],
    bcc
) => {

    return limiter.schedule(async () => {

        try {

            const attachments = [
                {
                    filename: 'LogoDevarana.png',
                    path: './static/img/LogoDevarana.png',
                    cid: 'logo'
                },
                ...extraAttachments
            ];

            const preparedAttachments = await Promise.all(
                attachments.map(prepareAttachment)
            );

            const bccRecipients = [
                'abrahamalvarado@devarana.mx',
                ...(bcc ? [bcc] : [])
            ];

            const { data, error } = await resend.emails.send({
                from,
                to: [to],
                bcc: bccRecipients,
                subject,
                html,
                attachments: preparedAttachments
            });

            if (error) {
                console.error('Error sending email:', error);
                return;
            }

            console.log('Email sent:', data.id);

            return data;

        } catch (error) {
            console.error('Error sending email:', error);
        }

    });

};


module.exports = mailSender;
