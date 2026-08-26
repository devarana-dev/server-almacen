const { mailSender } = require("../utils/sendMail")


const createHTML = (body) => {
    const html = `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <meta http-equiv="Content-Type" content="text/html charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Document</title>
    </head>
    <style type="text/css">
        *, ::before, ::after {
            
            box-sizing: border-box;
            border-width: 0;
            margin: 0;
            padding: 0;        
        }       
    </style>
    <body style="background-color: #f9f9f9;">
        <div style="background-color:#56739B;padding: 25px 0;"> <img src="cid:logo" alt="Logo" style="max-width: 200px;margin: auto;display: block;"> </div>
        ${body}
        <div style="background-color:#56739B;">
            <p style="color:#f9f9f9;text-align: center; padding: 30px 50px; font-size: 14px;"> Para cualquier duda o aclaración favor de ponerse en contacto con 
            <a style="color:#f9f9f9;font-weight:500;" href="mailto:abrahamalvarado@devarana.mx?subject=SG Almacén&body=Hola oye tengo un problema aquí adjunto evidencia."> el administrador del sistema. </a> </p>
        </div>
    </body>
    </html>`

    return html
}


function cancelarVale( usuario, valeSalida, responsable){
    const body = `
                    <h1>Cancelación de Vale de Salida</h1>
                    <p>Hola ${usuario.nombre} ${usuario.apellidoPaterno} </p>
                    <p>El Vale de salida para la siguiente actividad: ${ valeSalida.actividad.nombre } ha sido cancelado</p>
                    <p> El vale ha sido cancelado por el usuario ${responsable.nombre} ${responsable.apellidoPaterno} </p>
                    ${valeSalida.comentarios ? `<p> Han Añadido los siguientes comentarios ${valeSalida.comentarios}</p>` : ''}
                    <p>Puedes ingresar a la plataforma aquí <a href="http://erp-devarana.mx/login">Ingresar</a> </p>
                `
    // mailSender(usuario.email, 'Cancelación de Vale de Salida', body)

}

function completarVale( usuario, valeSalida ){
    const body = `
                    
                        <h1>Entregado de Vale de Salida</h1>
                        <p>Hola ${usuario.nombre} ${usuario.apellidoPaterno} </p>
                        <p>El Vale de salida para la siguiente actividad: ${valeSalida.actividad.nombre} ha sido entregado</p>
                        <p>Puedes ingresar a la plataforma aquí <a href="http://erp-devarana.mx/login">Ingresar</a> </p>
                    
                `
    // mailSender(usuario.email, 'Completado de Vale de Salida', body)
}

async function solicitarPrestamo ( responsable, actividad, usuario ){
    const body = `
                <div style="margin:auto; max-width:600px; width:100%; padding:15px;">
                <p style="color:#646375;padding-top: 15px;font-size: 18px;text-align:center;">Gestión de Vales de Almacén</p>
                    <h1 style="color:#646375;text-align: center;">Solicitud de Préstamo</h1>
                    <p style="color:#646375;padding: 15px 0;font-size: 16px;">Hola <span style="color:#d64767;font-weight:800">${usuario.nombre} ${usuario.apellidoPaterno}</span>,</p>
                    <p style="color:#646375;padding: 15px 0;font-size: 16px;">El usuario <span style="color:#d64767; font-weight:800">${responsable.nombre} ${responsable.apellidoPaterno}</span> ha solicitado un prestamo de material para la siguiente actividad: <span style="font-weight:800">${actividad.nombre}</span>.</p>
                    <p style="color:#646375;padding: 5px 0;font-size: 16px;">Puedes aprobar o rechazar la solicitud en la plataforma dentro del módulo de prestamos.</p>
                    <a style="font-size: 16px; margin: 15px auto; text-align: center; max-width: 150px; width: 100%; display:block; padding: 10px 15px; color:#f9f9f9; background-color:#d64767; text-decoration: none; border-radius: 15px;" href="http://erp-devarana.mx/prestamos">Ingresa Aquí</a>
                </div>
                
                `
    const html = createHTML(body)
    mailSender(usuario.email, 'Solicitud de Préstamo', html)
}


async function reporteBitacora ( reporte ){

    const { autor, tipoBitacora, involucrados, uid, correosParticipantes, proyecto } = reporte

    const body = `
                <div style="margin:auto; max-width:600px; width:100%; padding:15px;">
                    <p style="color:#646375;padding-top: 15px;font-size: 18px;text-align:center;">Bitácora de Obra Digital</p>
                    <h1 style="color:#646375;text-align: center;padding-bottom:10px;">Registro de ${tipoBitacora} </h1>
                    <p style="color:#646375;padding: 5px 0;font-size: 16px;"> El usuario <span style="color:#d64767; font-weight:800">${autor.nombre} ${autor.apellidoPaterno}</span> ha creado un Registro de ${tipoBitacora} de ${ proyecto } </p>
                    <p style="color:#646375;padding: 5px 0;font-size: 16px;"> Los siguientes usuarios han sido incluidos en la notificación de dicho reporte: </p>
                    <ul>
                        ${ involucrados.length > 0 ?  involucrados.map( usuario => `<li style="color:#646375;padding: 5px 0;font-size: 16px;">${usuario.nombre} ${usuario.apellidoPaterno}</li>`).join('') : '' }
                        ${
                            correosParticipantes && correosParticipantes.length > 0 ? 
                            correosParticipantes.map( correo => `<li style="color:#646375;padding: 5px 0;font-size: 16px;">${correo}</li>`).join('') : ''
                        }
                    </ul>
                    <p style="color:#646375;padding: 5px 0;font-size: 16px;"> Puedes conocer más detalles ingresando a la plataforma de Bitácora de Obra Digital: </p>
                    <a style="font-size: 16px; margin: 15px auto; text-align: center; max-width: 150px; width: 100%; display:block; padding: 10px 15px; color:#f9f9f9; background-color:#d64767; text-decoration: none; border-radius: 15px;" href="http://erp-devarana.mx/bitacora/${uid}">Ingresa Aquí</a>                    
                </div>
                
    `
    const html = createHTML(body)
    
    console.log({involucrados});
    
    
    involucrados.push(autor)
    involucrados.forEach( async usuario => {

        process.env.ENVIRONMENT !== 'development' && mailSender(usuario.email, `Registro de ${tipoBitacora}`, html )

        if( correosParticipantes.length > 0 ){
            correosParticipantes.forEach( correo => {
                process.env.ENVIRONMENT !== 'development' && mailSender(correo, `Registro de ${tipoBitacora}`, html )
            })
        }
    })
}


module.exports = {
    createHTML,
    cancelarVale,
    completarVale,
    solicitarPrestamo,
    reporteBitacora
}