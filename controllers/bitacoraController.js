const { Bitacora, TipoBitacora, GaleriaBitacora, User, Role} = require('../models')
const moment = require('moment')
const formidable = require('formidable-serverless')

const tinify = require('tinify');
const ComentariosBitacora = require('../models/ComentarioBitacora')
const GaleriaComentario = require('../models/GaleriaComentario')
const pdf = require('html-pdf');
const fs = require('fs');
const path = require('path');
const { getPagination, getPagingData } = require('../utils/paginacion')
const { Op, Sequelize } = require('sequelize')
const { reporteBitacora } = require('../email/Notificaciones')
const Etapas = require('../models/Etapas')
const PivotBitacoraUser = require('../models/PivotBitacoraUser')
const Users = require('../models/Users')
const Permisos = require('../models/Permisos')
const { io } = require('../services/socketService')
const Proyectos = require('../models/Proyectos')
const db = require('../config/db')
const MailBitacora = require('../models/MailBitacora')
const { uploadDynamicFiles } = require('../utils/dynamicFiles');
const { sendFiles } = require('../email/FIles');
const Empresa = require('../models/Empresa');
tinify.key = process.env.TINY_IMG_API_KEY;
// moment locale mx
moment.locale('es-mx')

exports.getBitacoras = async (req, res) => {
    const { userId, proyectoId, fechaInicio, fechaFin, etapaId, tipoBitacoraId, isNew = 0,  busqueda = "", ordenSolicitado = "DESC" } = req.query
    const { id } = req.user

    const userWhere = [

        userId ? {
            [Op.or]: [
                {"autorId" : Number(userId) },
                {"$autorInt.id$" : Number(userId) },
                {"$autorExt.id$" : Number(userId) },
                {"$participantes.pivot_bitacora_users.userId$" : Number(userId) },
            ]
        }     
        :
        {} 
        
    ]

    const etapaWhere = [
        etapaId ? {"$etapa.id$" : etapaId } : {},
    ]

    const proyectoWhere = [
        proyectoId ? {"$proyecto.id$" : proyectoId } : {},
    ]

    const proyectoWhereCounter = `proyectoId = ${proyectoId}`
    

    const busquedaWhere = busqueda ?
        {
            [Op.or]: [
                {"titulo" : {[Op.like]: `%${busqueda}%`}},
                {"$tipo_bitacora.nombre$" : {[Op.like]: `%${busqueda}%`}},
                {"$proyecto.nombre$" : {[Op.like]: `%${busqueda}%`}},
                {"$autorExt.nombre$" : {[Op.like]: `%${busqueda}%`}},
                {"$autorInt.nombre$" : {[Op.like]: `%${busqueda}%`}},
                {"$autorExt.apellidoPaterno$" : {[Op.like]: `%${busqueda}%`}},
                {"$autorInt.apellidoPaterno$" : {[Op.like]: `%${busqueda}%`}},
                {"actividad" : {[Op.like]: `%${busqueda}%`}},
            ]
        } : {}



    const fechaWhere = [
        fechaInicio ? {"fecha" : {[Op.gte]: moment(fechaInicio).startOf('day').format('YYYY-MM-DD HH:mm:ss')}} : {},     
        fechaFin ? {"fecha" : {[Op.lte]: moment(fechaFin).endOf('day').format('YYYY-MM-DD HH:mm:ss')}} : {}
    ]
   
    const tipoBitacoraWhere = [
        tipoBitacoraId ? {"tipoBitacoraId" : tipoBitacoraId } : {},
    ]
    

    try {

        const user = await Users.findOne({ where: { id }, include: [{ model: Role, include: Permisos}] })
        let whereAutor = {}

        if (user.role.permisos.some( item => item.permisos === 'crear bitacora' ))  {

            if( user.role.permisos.some( item => item.permisos === 'ver bitacora de otros' ) ) {

                whereAutor = {}

            }else{
                whereAutor = {
                    [Op.or]: [
                        { autorId: id },
                        {
                            '$participantes.pivot_bitacora_users.userId$': id,
                        },
                        {
                            externoId: id,
                        },
                    ]
                }
            }
            

            // revisar permisos


            const whereCounter = await Users.findOne({ where: { id }, include: [{ model: Role , include: Permisos}]})
            .then( async user => {
                
                if( user.role.permisos.some( item => item.permisos === 'ver bitacora de otros' ) ){
                    return true
                }else{
                    return false
                    
                }
            })

            const [[conteoBitacoras]] = await db.query(`
                    SELECT COUNT(DISTINCT bitacoras.id) as total,
                    COUNT(DISTINCT CASE WHEN bitacoras.tipoBitacoraId = 1 THEN bitacoras.id END) AS incidencias,
                    COUNT(DISTINCT CASE WHEN bitacoras.tipoBitacoraId = 2 THEN bitacoras.id END) AS acuerdos,
                    COUNT(DISTINCT CASE WHEN bitacoras.tipoBitacoraId = 3 THEN bitacoras.id END) AS inicio,
                    COUNT(DISTINCT CASE WHEN bitacoras.tipoBitacoraId = 4 THEN bitacoras.id END) AS cierre,
                    COUNT(DISTINCT CASE WHEN bitacoras.tipoBitacoraId = 5 THEN bitacoras.id END) AS eventos,
                    SUM(CASE WHEN pivot_bitacora_users.visited = 0  and pivot_bitacora_users.userId = ${id} THEN 1 ELSE 0 END) AS noVisto
                    FROM bitacoras
                    LEFT JOIN pivot_bitacora_users ON pivot_bitacora_users.bitacoraId = bitacoras.id
                    WHERE ${whereCounter ? `1` : `autorId = ${id} or pivot_bitacora_users.userId = ${id}` }
                    
            `)

            // every conteBitacoras value to number
            Object.keys(conteoBitacoras).forEach( key => conteoBitacoras[key] = Number(conteoBitacoras[key]) )
           
            const whereNuevo = Number(isNew) === 1 ? {
                [Op.and]: [
                    { '$participantes.pivot_bitacora_users.visited$': 0 },
                    { '$participantes.pivot_bitacora_users.userId$': id },
                ]
            } : {}

            const bitacoras = await Bitacora.findAll({
                include: [
                    { model: Proyectos, attributes: ['id', 'nombre'], where: proyectoWhere},
                    { model: TipoBitacora, attributes: ['nombre'] },
                    { model: GaleriaBitacora, attributes: ['url', 'type'] },
                    { model: Etapas, attributes: ['nombre'], where: etapaWhere},
                    { model: Empresa, attributes: ['nombreCompleto', 'nombreCorto'] },
                    {
                        model: User,
                        attributes: ['nombre', 'apellidoPaterno', 'apellidoMaterno', 'picture'],
                        as: 'autorInt',
                        required: false,
                        where: Sequelize.where(Sequelize.col('bitacora.esInterno'), true),
                    }, 
                    {
                        model: User,
                        attributes: ['nombre', 'apellidoPaterno', 'apellidoMaterno'],
                        as: 'autorExt',
                        required: false,
                        where: Sequelize.where(Sequelize.col('bitacora.esInterno'), false),
                    }, 
                    { model: User, attributes: ['id'], as: 'participantes' },
                ],
                order: [
                    ['id', ordenSolicitado]
                ],
                distinct: true,
                where: {[Op.and] : [fechaWhere, busquedaWhere, whereAutor, userWhere, tipoBitacoraWhere, whereNuevo]},
                // logging: console.log

            })
            res.status(200).json({bitacoras, conteoBitacoras})
        }else {
            res.status(200).json({bitacoras:[], conteoBitacoras: {total: 0, incidencias: 0, acuerdos: 0, inicio: 0, cierre: 0, avance: 0, noVisto: 0}})
        }
        
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Error al obtener las bitacoras", error})
    }
}

exports.getBitacora = async (req, res) => {

    try {
        await Bitacora.findOne({
                where: { uid: req.params.uid },
                include: [
                    { model: Proyectos, attributes: ['id', 'nombre'] },
                    { model: TipoBitacora, attributes: ['id', 'nombre'] },
                    { model: GaleriaBitacora, attributes: ['id', 'url', 'type'] },
                    { model: Etapas, attributes: ['nombre']},
                    { model: MailBitacora, attributes: ['id', 'mail']},
                    { model: Empresa, attributes: ['nombreCompleto', 'nombreCorto'] },
                    { model: User, attributes: ['id', 'nombre', 'apellidoPaterno', 'apellidoMaterno' ], as: 'participantes' },
                    { model: ComentariosBitacora, attributes: ['id', 'comentario', 'bitacoraId', 'autorId', 'createdAt'], include: [
                        { model: User, attributes: ['id', 'nombre', 'apellidoPaterno', 'apellidoMaterno', 'picture' ]},
                        { model: GaleriaComentario, attributes: ['id', 'url', 'type'] }
                    ] },
                    {
                        model: User,
                        attributes: ['nombre', 'apellidoPaterno', 'apellidoMaterno', 'picture' ],
                        as: 'autorInt',
                        required: false,
                        where: Sequelize.where(Sequelize.col('bitacora.esInterno'), true),
                    }, 
                    {
                        model: User,
                        attributes: ['nombre', 'apellidoPaterno', 'apellidoMaterno', 'picture'],
                        as: 'autorExt',
                        required: false,
                        where: Sequelize.where(Sequelize.col('bitacora.esInterno'), false),
                    }, 
                    {
                        model: User,
                        attributes: ['nombre', 'apellidoPaterno', 'apellidoMaterno'],
                        as: 'contratista',
                        required: false,
                    }
                ]
            }).then( bitacora => {
                if(!bitacora) {
                    res.status(404).json({ message: "No se encontró la bitácora" })
                } else {
                    res.status(200).json({ bitacora })
                }
            }).catch( error => {
                console.log(error);
                res.status(500).json({ message: "Error al obtener bitácora", error})
            })
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Error al obtener la bitácora", error})
    }
}

exports.createBitacora = async (req, res) => {

    const form = new formidable.IncomingForm({ multiples: true })
    // form.uploadDir = './static/bitacoras'
    form.keepExtensions = true
   
    form.parse(req, async (err, fields, files) => {


        //  obtener todos los participantesId del objeto fields
        const participantesId = Object.keys(fields).filter( (key) => key.includes('participantesId') )
        const participantes = participantesId.map( (key) => Number(fields[key]) )

        const correos = Object.keys(fields).filter( (key) => key.includes('correos') )
        const correosParticipantes = correos.map( (key) => fields[key] )



        if (err) return res.status(500).json({ message: "Error al subir la bitacora", err });

        const galeria = Object.values(files)
        try {

            const tipoBitacora = await TipoBitacora.findOne({ where: { id: fields.tipoBitacoraId } })

            const { clave, nombre: nombreProyecto } = await Proyectos.findOne({ where: { id: fields.proyectoId } })

            await Bitacora.create({
                titulo: fields.titulo,
                descripcion: fields.descripcion,
                proyectoId: fields.proyectoId,
                etapaId: fields.etapaId,                
                externoId: fields.externoId,
                tipoBitacoraId: fields.tipoBitacoraId,
                autorId: req.user.id,
                externoId: fields.externoId,
                actividad: fields.actividad,
                esInterno: fields.esInterno,
                empresaId: fields.empresaId,
                fecha: moment(new Date(fields.fecha)).format('YYYY-MM-DD HH:mm:ss'),

            }).then( async (bitacora) => {

                bitacora.update({
                    folio: `${clave}-${bitacora.id}`
                })

                await bitacora.setParticipantes(participantes).catch( (error) => {
                    console.log(error);
                    res.status(500).json({ message: "Error al vincular a los participantes", error })
                })
                    
                if( participantes.length > 0  || correosParticipantes.length > 0){

                    let where = { id: participantes }
                    let users = []

                    if( participantes.length > 0  ){
                        if( bitacora.externoId ){
                            where = {
                                [Op.or]: [
                                    { id: participantes },
                                    { id: bitacora.externoId }
                                ]
                            }
                        }
    
                        const usuariosParticipantes = await User.findAll({
                            where,
                        });
    
                        users = usuariosParticipantes.map( (user) => user.dataValues )
                    }
                    
                    if(correosParticipantes.length > 0){
                        // agregarlos a la tabla ext_mailbitacoras con el modelo MailBitacora
                        correosParticipantes.forEach( async (mail) => {
                            await MailBitacora.create({
                                mail,
                                bitacoraId: bitacora.id
                            })
                        })
                    }


                    const reporte = {
                        autor: req.user, 
                        tipoBitacora: tipoBitacora.dataValues.nombre, 
                        involucrados: users, 
                        uid: bitacora.dataValues.uid, 
                        correosParticipantes,
                        proyecto: nombreProyecto
                    }
                   

                    await reporteBitacora(reporte)
                }

                await uploadDynamicFiles(galeria, 'bitacoras').then( async (result) => {
                    await result.forEach( async (item) => {
                        await GaleriaBitacora.create({
                            url: item.url,
                            type: item.type
                        }).then( async (galeria) => {
                            await galeria.setBitacoras(bitacora.id)
                        }).catch( (error) => {
                            console.log(error);
                            res.status(500).json({ message: "Error syncronizar bitacora", error })
                        })
                    })     
                   
                    io.emit('nueva-bitacora', bitacora )                    
                    res.status(200).json({ message: "Bitacora creada correctamente", bitacora })   

                }).catch( (error) => {
                    console.log(error);
                    res.status(500).json({ message: "Hubo un problema al subir los archivos, pero la bitácora se ha generado correctamente, Contacta a soporte", error })
                })

                
            })    
        } catch (error) {  
            console.log(error);              
            res.status(500).json({ message: "Error al crear la bitacora", error })
            // 
        }   
    })
}

exports.createComentario = async (req, res) => {


    const form = new formidable.IncomingForm({ multiples: true })
    form.keepExtensions = true

    form.parse(req, async (err, fields, files) => {
        if (err) return res.status(500).json({ message: "Error al subir la bitacora", err });

        const { comentario, id } = fields

        const galeria = Object.values(files)

        try {
            await ComentariosBitacora.create({
                    bitacoraId: id,
                    comentario: comentario,
                    autorId: req.user.id
            }).then( async (comentario) => {
                
                
                await uploadDynamicFiles(galeria, 'bitacoras/comentarios').then( async (result) => {
                    await GaleriaComentario.bulkCreate(result.map( item => {
                        return { url:item.url, comentarioId: comentario.id, type: item.type }
                    }))

                    result = await ComentariosBitacora.findOne({
                        where: { id: comentario.id },
                        include: [
                            { model: User, attributes: ['id', 'nombre', 'apellidoPaterno', 'apellidoMaterno', 'picture' ] },
                            { model: GaleriaComentario, attributes: ['id', 'url', 'type'] }
                        ]
                    })

                    res.status(200).json({ message: "Comentario creado con exito", comentario:result })
                    
                })
            })
            
        } catch (error) {
            res.status(500).json({ message: "Error al crear el comentario", error })
        }
    })
}

// Generar reporte de bitacoras
exports.generateReport = async (req, res) => {
    const { titulo, descripcion, comentarios, imagenes, selectedOption = [], proyectoId, destinatarios } = req.body

    try {

        await Bitacora.findAll({
            where: { uid: selectedOption },
            include: [
                { model: TipoBitacora, attributes: ['id', 'nombre'] },
                    { model: GaleriaBitacora, attributes: ['id', 'url', 'type'] },
                    { model: Etapas, attributes: ['id', 'nombre']},                    
                    { model: User, attributes: ['id', 'nombre', 'apellidoPaterno', 'apellidoMaterno', 'esInterno' ], as: 'participantes' },
                    { model: Proyectos, attributes: ['id', 'nombre']  },
                    { model: MailBitacora, attributes: ['id', 'mail']},
                    { model: Empresa, attributes: ['id', 'nombreCompleto', 'nombreCorto'] },
                    { model: ComentariosBitacora, attributes: ['id', 'comentario', 'bitacoraId', 'autorId', 'createdAt'], include: [
                        { model: User, attributes: ['id', 'nombre', 'apellidoPaterno', 'apellidoMaterno', 'picture' ]},
                        { model: GaleriaComentario, attributes: ['id', 'url', 'type'] }
                    ] },
                    {
                        model: User,
                        attributes: ['nombre', 'apellidoPaterno', 'apellidoMaterno'],
                        as: 'autorInt',
                        required: false,
                        where: Sequelize.where(Sequelize.col('bitacora.esInterno'), true),
                    }, 
                    {
                        model: User,
                        attributes: ['nombre', 'apellidoPaterno', 'apellidoMaterno'],
                        as: 'autorExt',
                        required: false,
                        where: Sequelize.where(Sequelize.col('bitacora.esInterno'), false),
                    },
                    {
                        model: User,
                        attributes: ['nombre', 'apellidoPaterno', 'apellidoMaterno'],
                        as: 'contratista',
                        required: false,
                    }
                
            ],
            order: [
                ['id', 'ASC']
            ]
        }).then( async (bitacoras) => {
            const {logo} = await Proyectos.findOne({
                where: { id: proyectoId },
                attributes: ['logo']
            })

            
            await generatePdf(res, bitacoras,  titulo, descripcion, comentarios, imagenes, logo, destinatarios)
        })
        
        
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Error al generar el reporte", error })        
    }



}

exports.updateBitacoraView = async (req, res) => {
    const { uid } = req.params
    const { id } = req.user

    try {
        await Bitacora.findOne({
            where: { uid },
            include: [
                { model: User, attributes: ['id', 'nombre', 'apellidoPaterno', 'apellidoMaterno'], as: 'participantes' }
            ]
        }).then( async (bitacora) => {
            const participantes = bitacora.participantes.map( item => item.id )
            if ( participantes.includes(id) ) {
                await PivotBitacoraUser.update({ visited: true }, { where: { bitacoraId: bitacora.id, userId: id } })
            }
        })
        res.status(200).json({ message: "Bitacora actualizada correctamente" , id})
        
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Error al actualizar la bitacora", error })
    }    
}

exports.updateBitacoraConfirm = async (req, res) => {
    const { uid } = req.params
    const { id } = req.user

    try {
        await Bitacora.findOne({
            where: { uid },
            include: [
                { model: User, attributes: ['id', 'nombre', 'apellidoPaterno', 'apellidoMaterno'], as: 'participantes' }
            ]
        }).then( async (bitacora) => {
            const participantes = bitacora.participantes.map( item => item.id )
            if ( participantes.includes(id) ) {
                await PivotBitacoraUser.update({ confirmed: true }, { where: { bitacoraId: bitacora.id, userId: id } })
            }
        })
        res.status(200).json({ message: "Bitacora confirmada correctamente" , id})

    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Error al actualizar la bitacora", error })
    }
}




// Funciones


const generatePdf = async (response, bitacoras, titulo, descripcion, comentarios, imagenes, logotipoProyecto, destinatarios) => {


    const logo = fs.readFileSync(path.resolve(__dirname, '../static/img/logo.png'))
    const logoBase64 = logo.toString('base64')

    const pdfIcon = fs.readFileSync(path.resolve(__dirname, '../static/img/pdf-icon.png'))
    const logoPdfBase64 = pdfIcon.toString('base64')

    
    // print first bitacoras
    const content = `
    <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Document</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        </head>

        <style>
            @font-face {
                font-family: 'Mulish';
                font-style: normal;
                font-weight: 300;
                font-display: swap;
                src: url(https://fonts.gstatic.com/s/mulish/v12/1Ptvg83HX_SGhgqk3wot.woff2) format('woff2');
                unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
            }
            @font-face {
                font-family: 'Mulish';
                font-style: normal;
                font-weight: 500;
                font-display: swap;
                src: url(https://fonts.gstatic.com/s/mulish/v12/1Ptvg83HX_SGhgqk3wot.woff2) format('woff2');
                unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
            }
            @font-face {
                font-family: 'Mulish';
                font-style: normal;
                font-weight: 700;
                font-display: swap;
                src: url(https://fonts.gstatic.com/s/mulish/v12/1Ptvg83HX_SGhgqk3wot.woff2) format('woff2');
                unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
            }
            @font-face {
                font-family: 'Playfair Display';
                font-style: normal;
                font-weight: 400;
                font-display: swap;
                src: url(https://fonts.gstatic.com/s/playfairdisplay/v30/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvXDXbtM.woff2) format('woff2');
                unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
            }
            
            body{
                font-size: 12px;
            }

            h1, h2, h3, h4, h5, h6{
                font-family: 'Playfair Display', sans-serif;
                color:#646375;
                font-weight: 400!important;
            }
            p, li, span, a, td{
                font-family: 'Mulish', sans-serif;
                color:#646375;
                font-size: 1em;
                margin: 0 0 10px;
            }
            td{
                color:#646375;
            }
            * {
                
                text-transform: none!important;
            }
        </style>
        <body>

            <table style="width: 100%;border-spacing: 0;">
                <th style="width:20%;text-align:center;border: 1px solid rgba(0, 0, 0, .1);position:relative;">
                    <img src="https://devarana-storage.sfo3.cdn.digitaloceanspaces.com/iconos%2Fdevarana-logo.png" style="z-index:109321390123;position:absolute; width:calc(90% - 10px); top:0 ;left:0;right:0;bottom:0;margin:auto;">
                </th>
                <th style="width:60%;border: 1px solid rgba(0, 0, 0, .1);padding-bottom:5px;">
                    <h1 style="color:#d64767;text-align: center;font-size:1.2em;margin:0>">Reporte ${titulo} </h1>
                </th>
                <th style="width:20%;text-align:center;border: 1px solid rgba(0, 0, 0, .1);">
                    <img src="https://devarana-storage.sfo3.cdn.digitaloceanspaces.com/${logotipoProyecto}" style="width:calc(90% - 10px); padding-top:3px;margin:0;padding-bottom:0;">
                </th>
            </table>

            <p style="font-size: 1em;padding: 25px 0 25px;">
                ${descripcion}
            </p>

            <hr style="border: 1px solid rgba(0, 0, 0, .1);padding: 0 25px;">

            ${
                bitacoras.map( (bitacora, index) => {

                    const { folio, titulo, descripcion, actividad, fecha, tipo_bitacora, autorInt, autorExt, proyecto, etapa, empresa, contratista, participantes, galeria_bitacoras, comentarios_bitacoras, ext_mail_bitacoras } = bitacora
                    const { nombre:nombreTipoBitacora } = tipo_bitacora

                    return (`
                    <div style="background-color:#56739B;margin-top:10px;">
                        <p style="padding: 5px 20px;color:white;font-weight: 700;">Folio: ${folio} | ${ nombreTipoBitacora } </p>
                    </div>

                    <div style="position:relative;float:left">
                        <div style="width:50%; float:left;">
                            <div>
                                <p style="display:inline-block;font-size: 1em;font-weight: bold;">Fecha:</p>
                                <p style="display:inline-block;">${ moment(fecha).format('LLL') }</p>
                            </div>
                            
                            <div>
                                <p style="display:inline-block;font-size: 1em;font-weight: bold;">Autor:</p>
                                <p style="display:inline-block;">${ autorInt ? `${autorInt.nombre} ${autorInt.apellidoPaterno} ${autorInt.apellidoMaterno}` : `${autorExt.nombre} ${autorExt.apellidoPaterno} ${autorExt.apellidoMaterno}` }</p>
                            </div>
                            <div>
                                <p style="display:inline-block;font-size: 1em;font-weight: bold;">Proyecto:</p>
                                <p style="display:inline-block;">${proyecto.nombre}</p>
                            </div>
                            <div>
                                <p style="display:inline-block;font-size: 1em;font-weight: bold;">Etapa:</p>
                                <p style="display:inline-block;">${etapa.nombre}</p>
                            </div>
                            <div>
                                <p style="display:inline-block;font-size: 1em;font-weight: bold;">Actividad:</p>
                                <p style="display:inline-block;">${actividad}</p>
                            </div>

                            ${
                                contratista ? `
                                <div>
                                    <p style="display:inline-block;font-size: 1em;font-weight: bold;">Contratista:</p>
                                    <p style="display:inline-block;">${contratista.nombre}</p>
                                </div>
                                ` : ''
                            }
                            ${
                                empresa ? `
                                <div>
                                    <p style="display:inline-block;font-size: 1em;font-weight: bold;">Contratista:</p>
                                    <p style="display:inline-block;">${empresa.nombreCompleto}</p>
                                </div>
                                ` : ''
                            }
                            
                        </div>
                        <div style="width:50%; float:left;">
                            <div>
                                <p style="display:inline-block;font-size: 1em;font-weight: bold;">Título:</p>
                                <p style="display:inline-block;"> ${titulo} </p>
                            </div>
                            <div>
                                <p style="display:inline-block;font-size: 1em;font-weight: bold;">Descripción:</p>
                                <p style="display:inline-block;"> ${ descripcion } </p>
                            </div>
                        </div>
                    </div>
                    <div style="clear:both;"></div>
                    <div>
                    ${ 
                        participantes.length > 0 ? `
                        <div>
                            <p style="display:inline-block;font-size: 1em;font-weight: bold;">Participantes:</p>
                            ${
                                participantes.map( participante => {
                                    return `<p style="width:auto; display:inline-block; margin: 0px 2px;background-color: rgba(227, 227, 227, .5);padding: 2px 10px;">${participante.nombre} ${participante.apellidoPaterno} ${participante.apellidoMaterno}</p>`
                                }).join('')
                            }
                        </div>
                        ` : ''
                    }
                    ${ 
                        ext_mail_bitacoras && ext_mail_bitacoras.length > 0 ? `
                        <div>
                            <p style="display:inline-block;font-size: 1em;font-weight: bold;">Notificados:</p>
                            ${
                                ext_mail_bitacoras.map( notificado => {
                                    return `<p style="width:auto; display:inline-block; margin: 0px 2px;background-color: rgba(227, 227, 227, .5);padding: 2px 10px;">${notificado.mail}</p>`
                                }).join('')
                            }  
                        </div>
                        ` : ''
                    
                    }
                    </div>
                    ${
                        imagenes && galeria_bitacoras ? `
                        <div style="padding: 10px 0">
                            <p style="font-size: 1em;font-weight: bold">Evidencia:</p>
                            ${
                                galeria_bitacoras.map( evidencia => {
                                    if(evidencia.type === 'application/pdf'){
                                        return (`
                                             <a href="https://devarana-storage.sfo3.cdn.digitaloceanspaces.com/${evidencia.url}" style="width:100px; height: 100px; padding: 10px 10px;text-decoration:none;">
                                                <img src="data:image/png;base64,${logoPdfBase64}" style="width:100px; height: 100px; padding: 10px 10px;" />
                                            </a>`)
                                    }else{
                                        return (
                                            `<a href="https://devarana-storage.sfo3.cdn.digitaloceanspaces.com/${evidencia.url}" style="width:100px; height: 100px; padding: 10px 10px;text-decoration:none;">
                                                <img src="https://devarana-storage.sfo3.cdn.digitaloceanspaces.com/${evidencia.url}" style="width:100px; height: 100px; padding: 10px 10px;"/>
                                            </a>
                                            `
                                        )
                                    }
                                }).join('')
                            }
                        </div>`

                        : ''
                    }
        
                   ${
                     comentarios && comentarios_bitacoras.length > 0 ? `
                     <div>
                        <p style="width: 100%;font-size: 1em;font-weight: bold">Comentarios ( ${comentarios_bitacoras.length} )</p>
                        ${
                            comentarios_bitacoras.map( comentario => {
                                return (`
                                    <div style="margin-bottom: 15px;padding-left:15px">
                                        <div style="width: 7px;height: 7px;background-color: rgba(0, 0, 0, .3)"></div>
                                        <div style="width: calc( 100% - 30px);display: inline-block;border-left: 1px solid rgba(0, 0, 0, .1);padding-left: 5px;">
                                            <div style="padding-left: 5px;">
                                                <p style="display: inline-block;margin: 5px 0 0;font-size: 1em;font-weight: bold;">Fecha:</p>
                                                <p style="display: inline-block;margin: 5px 0 0;"> ${ moment(comentario.createdAt).format('LLL') } </p>
                                            </div>
                                            <div style="padding-left: 5px;">
                                                <p style="display: inline-block;margin: 5px 0 0;font-size: 1em;font-weight: bold;">Autor:</p>
                                                <p style="display: inline-block;margin: 5px 0 0;"> ${comentario.user.nombre + ' ' + comentario.user.apellidoPaterno + ' ' + comentario.user.apellidoMaterno} </p>
                                            </div>
                                            <div style="padding-left: 5px;">
                                                <p style="display: inline-block;margin: 5px 0 0;font-size: 1em;font-weight: bold;">Comentario:</p>
                                                <p style="display: inline-block;margin: 5px 0 0;"> ${comentario.comentario} </p>
                                            </div>
                                            ${
                                                imagenes && comentario.galeria_comentarios && comentario.galeria_comentarios.length > 0 ? `
                                                <div style="padding: 10px 5px">
                                                    <div style="padding: 10px 0">
                                                        <p style="font-size: 1em;font-weight: bold">Evidencia:</p>
                                                        ${
                                                            comentario.galeria_comentarios.map( evidencia => ( 
                                                                evidencia.type === 'application/pdf' ?
                                                                    `<a href="https://devarana-storage.sfo3.cdn.digitaloceanspaces.com/${evidencia.url}" style="width:100px; height: 100px; padding: 10px 10px;text-decoration:none;">
                                                                        <img src="data:image/png;base64,${logoPdfBase64}" style="width:100px; height: 100px; padding: 10px 10px;"/>
                                                                    </a>`
                                                                :

                                                                    `<a href="https://devarana-storage.sfo3.cdn.digitaloceanspaces.com/${evidencia.url}" style="width:100px; height: 100px; padding: 10px 10px;text-decoration:none;">
                                                                        <img src="https://devarana-storage.sfo3.cdn.digitaloceanspaces.com/${evidencia.url}" style="width:100px; height: 100px; padding: 10px 10px;"/>
                                                                    </a>
                                                                    `
                                                            )).join(' ')
                                                        }
                                                    </div>
                                                </div>
                                                ` : ''
                                            }
                                        </div>
                                        
                                    </div>
                            `)
                            }).join('')

                        }
                    </div>
                     `
                     : ''
                   }
                </div>
                `)
                }).join('')
            }
            
        </body>

        </html>
        <div id="pageFooter" style="text-align: center; height:30px;">
            <div style="display: inline-block;"><span style="margin:0;">Página {{page}} de {{pages}}</span></div>
            <div style="display: inline-block;float:right;"><img src="data:image/png;base64,${logoBase64}" style="width: 25px; height: 25px;" /></div>
        </div>
    `  
        pdf.create(
            content,
            {
                format: 'A4',
                phantomPath: require('phantomjs-prebuilt').path,
                orientation: 'portrait',
                border: {
                    right: '0.4in',
                    left: '0.4in',
                    top: '0.41in',
                    bottom: '0.1in'
                },
                footer: {
                    height: '40px',
                },
                zoomFactor: '1',   
                timeout: 120000, // 120 segundos de espera                 
            }
        ).toFile(`./public/pdf/Reporte-${moment().format('DD-MM-YYYY-hh-mm')}.pdf`, (err, res) => {
            if (err) return console.log(err);

            fs.readFile(res.filename, (err, data) => {
                if (err) throw err;
                response.contentType("application/pdf");
                response.setHeader('Content-Disposition', `attachment; filename=Reporte-${moment().format('DD-MM-YYYY-hh-mm')}.pdf`);
                response.send(data);

                if(destinatarios && destinatarios.length > 0){
                    sendFiles(destinatarios, titulo, data)
                }

                fs.unlinkSync(res.filename, (err) => {  if (err) throw err });
            })                
        })

}




        