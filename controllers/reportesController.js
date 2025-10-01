const moment = require('moment');
const sequelize = require('sequelize');
const db = require('../config/db');
const { getPagination, getPagingData } = require('../utils/paginacion');
const pdf = require('html-pdf');

const fs = require('fs');
const path = require('path');
const Users = require('../models/Users');
const { Role } = require('../models');
const Permisos = require('../models/Permisos');

const puppeteer = require('puppeteer');
const puppeteerCore = require('puppeteer-core');

// path




exports.getReportesAcumulados = async (req, res) => {

    const {  fechaInicial, fechaFinal, busqueda, centroCosto, orden, page, limit:size, ordenSolicitado, type} = req.query;

    // verificar permisos
   const user = await Users.findOne({ where: { id: req.user.id }, include: { 
        model: Role,
        include: {
            model: Permisos, 
        }
   } });

    const { role } = user.dataValues
    const { permisos } = role.dataValues
    const userPermit = permisos.map(permiso => permiso.permisos).includes('ver reportes')

    const { limit, offset } = getPagination(page, size);


    let searchByCentroCosto = '';

    centroCosto ? centroCosto.forEach((element, index) => {
        searchByCentroCosto += `insumos.centroCosto = '${element.trim()}'`
        if(index !== centroCosto.length - 1){
            searchByCentroCosto += ` OR `
        }
        } ) : searchByCentroCosto = '';
    


    let where = ''
    let date = ''
    if (centroCosto){
        where += `AND (${searchByCentroCosto})`
    }

    if(busqueda){
        where += ` AND (insumos.nombre LIKE '%${busqueda}%' OR insumos.claveEnk LIKE '%${busqueda}%')`
    }

    if( fechaInicial && fechaFinal ){
        date += ` AND (detalle_salidas.updatedAt BETWEEN '${ moment(fechaInicial).format("YYYY-MM-DD HH:mm:ss") }' AND '${ moment(fechaFinal).format("YYYY-MM-DD HH:mm:ss") }')`
    }
    
    if(!userPermit){
        where += ` AND vale_salidas.userId = ${ req.user.id }`
    }

    try {

        let reportData = { }

        const countQuery = await db.query({
            query: `SELECT COUNT( DISTINCT insumos.id) AS total FROM insumos
            LEFT JOIN detalle_salidas on detalle_salidas.insumoId = insumos.id
            ${ !userPermit? 'LEFT JOIN vale_salidas on vale_salidas.id = detalle_salidas.valeSalidaId' : ''}  
            WHERE 1
            ${ where }
            ${ date }
            `           
        });


        reportQuery = `
            SELECT DISTINCT insumos.claveEnk, 
            insumos.nombre, 
            insumos.centroCosto,
            (SELECT SUM(detalle_salidas.cantidadEntregada) from detalle_salidas WHERE detalle_salidas.insumoId = insumos.id ${ date ? ` ${date} `: '' } ) as totalEntregado
            FROM insumos
            LEFT JOIN detalle_salidas on detalle_salidas.insumoId = insumos.id
            ${ !userPermit? 'LEFT JOIN vale_salidas on vale_salidas.id = detalle_salidas.valeSalidaId' : ''}  
            WHERE 1
            ${ where }
            ${ ordenSolicitado? `ORDER BY totalEntregado ${ordenSolicitado}` : `ORDER BY insumos.id ${ orden }` }
            limit ${limit} offset ${offset}
        `

        await db.query(reportQuery, {
            type: sequelize.QueryTypes.SELECT,
        }).then(data => {
            reportData.count = countQuery[0][0].total
            reportData.rows = data
            const response = getPagingData(reportData, page, limit);
            res.status(200).json(response);
        })

    } catch (err) {
        res.status(500).json({ message: 'Error al obtener el reporte', error: err.message })
    }
}

exports.getReporteGeneral = async (req, res) => {

    const {  fechaInicial, fechaFinal, busqueda, centroCosto, page, limit:size, actividad, lider, residente, status } = req.query;

    const { limit, offset } = getPagination(page, size);

    const user = await Users.findOne({ where: { id: req.user.id }, include: { 
        model: Role,
        include: {
            model: Permisos, 
        }
   } });

   const { role } = user.dataValues
   const { permisos } = role.dataValues
   const userPermit = permisos.map(permiso => permiso.permisos).includes('ver reportes')

    let where = ''
    let date = ''

    let searchByCentroCosto = '';

    centroCosto ? centroCosto.forEach((element, index) => {
        searchByCentroCosto += `insumos.centroCosto = '${element.trim()}'`
        if(index !== centroCosto.length - 1){
            searchByCentroCosto += ` OR `
        }
        } ) : searchByCentroCosto = '';

    if(centroCosto){
        where += `AND ${searchByCentroCosto}`
    }

    if(busqueda){
        where += `   AND ( insumos.nombre LIKE '%${busqueda}%' 
                        OR vale_salidas.id LIKE '%${busqueda}%' 
                        OR insumos.claveEnk LIKE '%${busqueda}%'
                        OR actividades.nombre LIKE '%${busqueda}%'
                        OR personals.nombre LIKE '%${busqueda}%'
                        OR personals.apellidoPaterno LIKE '%${busqueda}%'
                        OR personals.apellidoMaterno LIKE '%${busqueda}%'
                        OR users.nombre LIKE '%${busqueda}%'
                        OR users.apellidoPaterno LIKE '%${busqueda}%'
                        OR users.apellidoMaterno LIKE '%${busqueda}%'
                        OR vale_salidas.salidaEnkontrol LIKE '%${busqueda}%'
                    )`
    }

    if( fechaInicial && fechaFinal ){
        date += ` AND (vale_salidas.fecha BETWEEN '${ moment(fechaInicial).format("YYYY-MM-DD HH:mm:ss") }' AND '${ moment(fechaFinal).format("YYYY-MM-DD HH:mm:ss") }')`
    }

    if(actividad){
        where += ` AND (actividades.id = '${actividad}')`
    }
    if(lider){
        where += ` AND (personals.id = '${lider}')`
    }
    if(residente){
        where += ` AND (users.id = '${residente}')`
    }
    if(status && status !== ''){
        where += ` AND (detalle_salidas.status = ${status})`
    }

    if(!userPermit){
        where += ` AND vale_salidas.userId = ${ req.user.id }`
    }


    try {

        let reportData = { }

        const countQuery = await db.query({
            query: `SELECT COUNT( insumos.id ) AS total 
            FROM insumos 
            INNER JOIN detalle_salidas on detalle_salidas.insumoId = insumos.id
            INNER JOIN vale_salidas ON detalle_salidas.valeSalidaId = vale_salidas.id
            INNER JOIN actividades ON vale_salidas.actividadId = actividades.id
            INNER JOIN personals ON vale_salidas.personalId = personals.id
            INNER JOIN users ON vale_salidas.userId = users.id
            WHERE 1
            ${ where }
            ${ date }
            `           
        });


        reportQuery = `
            SELECT insumos.id, insumos.nombre as insumoNombre, insumos.claveEnk, insumos.centroCosto,
            detalle_salidas.cantidadSolicitada, detalle_salidas.cantidadEntregada,
            actividades.nombre as actividadNombre, personals.nombre as personalNombre, personals.apellidoPaterno, personals.apellidoMaterno,
            users.nombre as usuarioNombre, users.apellidoPaterno, vale_salidas.salidaEnkontrol, vale_salidas.fecha,
            concat(personals.nombre, ' (', personals.apellidoMaterno, ') ', personals.apellidoPaterno) as personal,
            concat(users.nombre, ' ', users.apellidoPaterno) as usuario,
            vale_salidas.id as folio,
            detalle_salidas.status
            FROM insumos 
            INNER JOIN detalle_salidas on detalle_salidas.insumoId = insumos.id
            INNER JOIN vale_salidas ON detalle_salidas.valeSalidaId = vale_salidas.id
            INNER JOIN actividades ON vale_salidas.actividadId = actividades.id
            INNER JOIN personals ON vale_salidas.personalId = personals.id
            INNER JOIN users ON vale_salidas.userId = users.id
            WHERE 1
            ${ where }
            ${ date }
            limit ${limit} offset ${offset}
        `

        await db.query(reportQuery, {
            type: sequelize.QueryTypes.SELECT,
        }).then(data => {
            reportData.count = countQuery[0][0].total
            reportData.rows = data
            const response = getPagingData(reportData, page, limit);
            res.status(200).json(response);
        })

    } catch (err) {
        res.status(500).json({ message: 'Error al obtener el reporte', error: err.message })
    }
}

exports.generateReporteAcumulados = async ( req, res ) => {
    const {  fechaInicial, fechaFinal, busqueda, centroCosto, orden, page, limit:size, ordenSolicitado, type, isReport} = req.query;

    let filterNames = req.query.filterNames ? JSON.parse(req.query.filterNames) : {};

    const user = await Users.findOne({ where: { id: req.user.id }, include: { 
        model: Role,
        include: {
            model: Permisos, 
        }
   } });

    const { role } = user.dataValues
    const { permisos } = role.dataValues
    const userPermit = permisos.map(permiso => permiso.permisos).includes('ver reportes')

    let searchByCentroCosto = '';

    centroCosto ? centroCosto.forEach((element, index) => {
        searchByCentroCosto += `insumos.centroCosto = '${element.trim()}'`
        if(index !== centroCosto.length - 1){
            searchByCentroCosto += ` OR `
        }
        } ) : searchByCentroCosto = '';
    


    let where = ''
    let date = ''
    if (centroCosto){
        where += `AND (${searchByCentroCosto})`
    }

    if(busqueda){
        where += ` AND (insumos.nombre LIKE '%${busqueda}%' OR insumos.claveEnk LIKE '%${busqueda}%')`
    }

    if( fechaInicial && fechaFinal ){
        date += ` AND (detalle_salidas.updatedAt BETWEEN '${ moment(fechaInicial).format("YYYY-MM-DD HH:mm:ss") }' AND '${ moment(fechaFinal).format("YYYY-MM-DD HH:mm:ss") }')`
    }

    if(!userPermit){
        where += ` AND vale_salidas.userId = ${ req.user.id }`
    }
    


    try {

        reportQuery = `
            SELECT DISTINCT insumos.claveEnk, 
            insumos.nombre, 
            insumos.centroCosto,
            (SELECT SUM(detalle_salidas.cantidadEntregada) from detalle_salidas WHERE detalle_salidas.insumoId = insumos.id ${ date ? ` ${date} `: '' } ) as totalEntregado
            FROM insumos
            LEFT JOIN detalle_salidas on detalle_salidas.insumoId = insumos.id
            ${ !userPermit? 'LEFT JOIN vale_salidas on vale_salidas.id = detalle_salidas.valeSalidaId' : ''}  
            WHERE 1
            ${ where }
            ${ ordenSolicitado? `ORDER BY totalEntregado ${ordenSolicitado}` : `ORDER BY insumos.id ${ orden }` }
        `

        await db.query(reportQuery, {
            type: sequelize.QueryTypes.SELECT,
        }).then(data => {
            if(isReport === 'true'){
                const header = [
                    { id: 'nombre', name: 'Nombre', prompt: 'Nombre', align: 'left', padding: 0 },
                    { id: 'centroCosto', name: 'Centro de costo', prompt: 'Centro de costo', width: 100, align: 'center', padding: 0 },
                    { id: 'totalEntregado', name: 'Total entregado', prompt: 'Total entregado', width: 80, align: 'center', padding: 0 },
                ]
                
                filterNames.titulo = 'Reporte Acumulados'
                
                generatePdf(data, header, filterNames, res)

            }else {
                res.status(200).json(data);
            }
        })

    } catch (err) {
        res.status(500).json({ message: 'Error al obtener el reporte', error: err.message })
    }
}

exports.generateReporteGeneral = async ( req, res ) => {
    const {  fechaInicial, fechaFinal, busqueda, centroCosto, actividad, lider, residente, status, isReport} = req.query;

    let filterNames = req.query.filterNames ? JSON.parse(req.query.filterNames) : {};

    
    try {

        const user = await Users.findOne({ where: { id: req.user.id }, include: { 
            model: Role,
            include: {
                model: Permisos, 
            }
        } });
    
        const { role } = user.dataValues
        const { permisos } = role.dataValues
        const userPermit = permisos.map(permiso => permiso.permisos).includes('ver reportes')

        let where = ''
        let date = ''

        let searchByCentroCosto = '';

        centroCosto ? centroCosto.forEach((element, index) => {
            searchByCentroCosto += `insumos.centroCosto = '${element.trim()}'`
            if(index !== centroCosto.length - 1){
                searchByCentroCosto += ` OR `
            }
            } ) : searchByCentroCosto = '';

        if(centroCosto){
            where += `AND ${searchByCentroCosto}`
        }

        if(busqueda){
            where += `   AND ( insumos.nombre LIKE '%${busqueda}%' 
                            OR vale_salidas.id LIKE '%${busqueda}%' 
                            OR insumos.claveEnk LIKE '%${busqueda}%'
                            OR actividades.nombre LIKE '%${busqueda}%'
                            OR personals.nombre LIKE '%${busqueda}%'
                            OR personals.apellidoPaterno LIKE '%${busqueda}%'
                            OR personals.apellidoMaterno LIKE '%${busqueda}%'
                            OR users.nombre LIKE '%${busqueda}%'
                            OR users.apellidoPaterno LIKE '%${busqueda}%'
                            OR users.apellidoMaterno LIKE '%${busqueda}%'
                            OR vale_salidas.salidaEnkontrol LIKE '%${busqueda}%'
                        )`
        }

        if( fechaInicial && fechaFinal ){
            date += ` AND (vale_salidas.fecha BETWEEN '${ moment(fechaInicial).startOf('day').format("YYYY-MM-DD HH:mm:ss") }' AND '${ moment(fechaFinal).endOf('day').format("YYYY-MM-DD HH:mm:ss") }')`
        }

        if(actividad){
            where += ` AND (actividades.id = '${actividad}')`
        }
        if(lider){
            where += ` AND (personals.id = '${lider}')`
        }
        if(residente){
            where += ` AND (users.id = '${residente}')`
        }
        if(status && status !== ''){
            where += ` AND (detalle_salidas.status = ${status})`
        }

        if(!userPermit){
            where += ` AND vale_salidas.userId = ${ req.user.id }`
        }

        reportQuery = `
            SELECT insumos.id, insumos.nombre as insumoNombre, insumos.claveEnk, insumos.centroCosto,
            detalle_salidas.cantidadSolicitada, detalle_salidas.cantidadEntregada,
            actividades.nombre as actividadNombre, personals.nombre as personalNombre, personals.apellidoPaterno, personals.apellidoMaterno,
            users.nombre as usuarioNombre, users.apellidoPaterno, vale_salidas.salidaEnkontrol, vale_salidas.fecha,
            concat(personals.nombre, ' (', personals.apellidoMaterno, ') ', personals.apellidoPaterno) as personal,
            concat(users.nombre, ' ', users.apellidoPaterno) as usuario,
            vale_salidas.id as folio,
            detalle_salidas.status
            FROM insumos 
            INNER JOIN detalle_salidas on detalle_salidas.insumoId = insumos.id
            INNER JOIN vale_salidas ON detalle_salidas.valeSalidaId = vale_salidas.id
            INNER JOIN actividades ON vale_salidas.actividadId = actividades.id
            INNER JOIN personals ON vale_salidas.personalId = personals.id
            INNER JOIN users ON vale_salidas.userId = users.id
            WHERE 1
            ${ where }
            ${ date }
            `

        await db.query(reportQuery, {
            type: sequelize.QueryTypes.SELECT,
        }).then( async data => {

            if(isReport === 'true'){
                // 
                const header = [
                    { id: 'folio', name: 'ID', prompt: 'ID', width: 20, align: 'center', padding: 0 },
                    { id: 'insumoNombre', name: 'Insumo', prompt: 'Insumo', width: 160, align: 'left', padding: 0 },
                    { id: 'claveEnk', name: 'ID EK', prompt: 'ID EK', width: 50, align: 'center', padding: 0 },
                    { id: 'centroCosto', name: 'Centro Costo', prompt: 'Centro de Costo', width: 40, align: 'center', padding: 0 },
                    { id: 'cantidadSolicitada', name: 'Cantidad Solicitada', prompt: 'Cantidad Solicitada', width: 40, align: 'center', padding: 0 },
                    { id: 'cantidadEntregada', name: 'Cantidad Entregada', prompt: 'Cantidad Entregada', width: 40, align: 'center', padding: 0 },
                    { id: 'actividadNombre', name: 'Actividad', prompt: 'Actividad', width: 100, align: 'left', padding: 0 },
                    { id: 'personal', name: 'Personal', prompt: 'Personal', width: 140, align: 'left', padding: 0 },
                    { id: 'usuario', name: 'Usuario', prompt: 'Usuario', width: 100, align: 'left', padding: 0 },
                    { id: 'salidaEnkontrol', name: 'Salida Enkontrol', prompt: 'Salida Enkontrol', width: 100, align: 'center', padding: 0 },
                    { id: 'fecha', name: 'Fecha', prompt: 'Fecha', width: 60, align: 'center', padding: 0 },
                    { id: 'status', name: 'Status', prompt: 'Status', width: 40, align: 'center', padding: 0 },
                ]
                
                filterNames.titulo = 'Reporte General'
                
                generatePdf(data, header, filterNames, res)

                
            }else {
                res.status(200).json(data);
            }

        })
    
    } catch (err) {
        res.status(500).json({ message: 'Error al obtener el reporte', error: err.message })
    }
}

const generatePdf = async ( data, header, filterNames, res ) => {

    
    const { titulo, centroCosto, fechaInicial, fechaFinal, busqueda, actividad, personal, usuario, status } = filterNames

    const content = `
        <!doctype html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>PDF Result Template</title>
                <style>
                    tr{
                        font-family: 'Roboto', sans-serif;
                        font-size: 8px;
                        color: #000;
                        margin: 0;
                        padding: 0;
                        border: 0;
                    }
                    thead{
                        font-family: 'Roboto', sans-serif;
                        font-size: 8px;
                        margin: 0;
                        padding: 0;
                        border: 0;
                        background-color: #56739B;
                    }
                    th{
                        font-family: 'Roboto', sans-serif;
                        color: #fff;
                        font-weight: 700;
                    }
                    td{
                        padding: 5px;
                    }
                </style>
            </head>
                <body>
                    <table style="width:100%">
                        <thead style="display:none">
                            ${ header.map(heading => `<th style="width:${heading.width}px;">${heading.name}</th>`).join('') }
                        </thead>
                        <tbody>
                            ${ data.map(row => `
                                <tr>
                                    ${ header.map(column => {
                                        if(column.id === 'status'){
                                            if(row[column.id] === 1){
                                                return `<td style="width:${column.width}px;text-align:${column.align}">En Proceso</td>`
                                            }else if(row[column.id] === 3){
                                                return `<td style="width:${column.width}px;text-align:${column.align}">Entregado</td>`
                                            }else{
                                                return `<td style="width:${column.width}px;text-align:${column.align}">Cancelado</td>`
                                            }
                                            }else if(column.id === 'fecha'){
                                                return `<td style="width:${column.width}px;text-align:${column.align}">${moment(row[column.id]).format('DD/MM/YYYY')}</td>`
                                            }else if(column.id === 'totalEntregado'){
                                                return `<td style="width:${column.width}px;text-align:${column.align}">${row[column.id] ? row[column.id] : "0.00" }</td>`

                                            }else{
                                                return `<td style="width:${column.width}px;text-align:${column.align}">${row[column.id]}</td>`
                                            }
                                    }).join('') }
                                </tr>
                            `).join('') }   
                        </tbody>
                </body>
            </html>
    `;


    // const logo = fs.readFileSync(path.resolve('../static/img/logo.png'), { encoding: 'base64' });

    

    pdf.create(content, {
        timeout: 1200000,
        format: 'A4',
        orientation: 'landscape',
        border: {
            top: '0.1in',
            right: '0.2in',
            bottom: '0.1in',
            left: '0.2in'
        },
        header: {
            height: '1.65in',
            width: '100%',
            contents: ` 
            <table style="width: 100%; font-size: 8px; id="pageHeader">
                <tr>
                    <td style="width:10%">
                        <img src="${ path.resolve('./static/img/logo.png') }"
                        style="width: 50px; height: 50px; padding:0 25%">
                        </td>
                        <td style="width: 50%; text-align: right;">
                        <h1 style="text-align:center; color:#646375;">${titulo || ''}</h1>
                        <h2 style="text-align:center; color:#646375;"> Vales de Salida de Almacén </h2>
                    </td>
                    <td style="width:15%;padding:5px;">
                        <p style="font-weight:bold;color:#646375;"> Centro de Costo: <span style="font-weight:normal;"> ${centroCosto || '-'} </span> </p>
                        <p style="font-weight:bold;color:#646375;"> Fecha de Inicio: <span style="font-weight:normal;"> ${fechaInicial || '-'} </span> </p>
                        <p style="font-weight:bold;color:#646375;"> Fecha Final: <span style="font-weight:normal;"> ${fechaFinal || '-'} </span> </p>
                        <p style="font-weight:bold;color:#646375;"> Busqueda: <span style="font-weight:normal;"> ${busqueda || '-'} </span> </p>
                    </td>
                    <td style="width:15%;padding:5px;">
                        <p style="font-weight:bold;color:#646375;"> Actividad: <span style="font-weight:normal;"> ${actividad || '-'} </span> </p>
                        <p style="font-weight:bold;color:#646375;"> Lider de cuadrilla: <span style="font-weight:normal;"> ${personal || '-'} </span> </p>
                        <p style="font-weight:bold;color:#646375;"> Usuario: <span style="font-weight:normal;"> ${usuario || '-'} </span> </p>
                        <p style="font-weight:bold;color:#646375;"> Estatus: <span style="font-weight:normal;"> ${status || '-'} </span> </p>
                    </td>
                </tr>
            </table>
            <table style="width: 100%;"> 
                <thead>
                    ${ header.map(heading => `<th style="width:${heading.width}px;padding:10px 0;">${heading.name}</th>`).join('') }
                </thead>
            </table>
            `
        },
        footer: {
            height: '0.5in',
            contents: {
                default: '<span style="color: #444;">{{page}}</span>/<span>{{pages}}</span>', // fallback value
                first: '<span style="color: #444;">{{page}}</span>/<span>{{pages}}</span>',
                2: '<span style="color: #444;">{{page}}</span>/<span>{{pages}}</span>',
                last: '<span style="color: #444;">{{page}}</span>/<span>{{pages}}</span>'
            }
        }
    }).toFile(`./public/pdf/Reporte-${moment().format('DD-MM-YYYY-hh-mm')}.pdf`, (err, result) => {
        if(err){
            res.status(500).json({ message: 'Error al generar el pdf', error: err.message })
        }else{           
            fs.readFile(result.filename, (err, data) => {
                if(err){
                    res.status(500).json({ message: 'Error al leer el pdf', error: err.message })
                }else{
                    res.contentType('application/pdf');
                    res.send(data);

                    fs.unlink(result.filename, (err) => {
                        if(err){
                            console.log(err);
                        }
                    })
                }
            })
        }
    })

    // let browser;
    // if(process.env.CHROMIUM_PATH === undefined) {
    //     browser = await puppeteer.launch({
    //     });
    // } else {    
    //     browser = await puppeteerCore.launch({
    //         executablePath: process.env.CHROMIUM_PATH,
    //         args: ['--no-sandbox', '--disable-setuid-sandbox'],
    //         ignoreDefaultArgs: ['--disable-extensions']
    //     });
    // } 

    // try {
    //     const page = await browser.newPage();
        
    //     await page.setViewport({ width: 1440, height: 980, deviceScaleFactor: 1 });

    //     await page.setContent(content, { waitUntil: 'networkidle0', timeout: 0 });

    //     const pdfPath = path.resolve(`./public/pdf/Reporte-${moment().format('DD-MM-YYYY-hh-mm')}.pdf`);

    //     await page.pdf({
    //         path: pdfPath,
    //         format: 'A4',
    //         landscape: true,
    //         printBackground: true,
    //         margin: {
    //             top: '0.1in',
    //             right: '0.2in',
    //             bottom: '0.1in',
    //             left: '0.2in'
    //         },
    //         displayHeaderFooter: !!true,
    //         headerTemplate: `
    //             <div style="width: 100%; margin-top:20px; padding:0 20px; height: 120px;">
    //                 <table style="width: 100%; font-size: 8px; id="pageHeader">
    //                         <tr>
    //                         <td style="width:10%">
    //                             <img src="${ logo }"
    //                             style="width: 50px; height: 50px; padding:0 25%">
    //                             </td>
    //                             <td style="width: 50%; text-align: right;">
    //                             <h1 style="text-align:center; color:#646375;">${titulo || ''}</h1>
    //                             <h2 style="text-align:center; color:#646375;"> Vales de Salida de Almacén </h2>
    //                         </td>
    //                         <td style="width:15%;padding:5px;">
    //                             <p style="font-weight:bold;color:#646375;"> Centro de Costo: <span style="font-weight:normal;"> ${centroCosto || '-'} </span> </p>
    //                             <p style="font-weight:bold;color:#646375;"> Fecha de Inicio: <span style="font-weight:normal;"> ${fechaInicial || '-'} </span> </p>
    //                             <p style="font-weight:bold;color:#646375;"> Fecha Final: <span style="font-weight:normal;"> ${fechaFinal || '-'} </span> </p>
    //                             <p style="font-weight:bold;color:#646375;"> Busqueda: <span style="font-weight:normal;"> ${busqueda || '-'} </span> </p>
    //                         </td>
    //                         <td style="width:15%;padding:5px;">
    //                             <p style="font-weight:bold;color:#646375;"> Actividad: <span style="font-weight:normal;"> ${actividad || '-'} </span> </p>
    //                             <p style="font-weight:bold;color:#646375;"> Lider de cuadrilla: <span style="font-weight:normal;"> ${personal || '-'} </span> </p>
    //                             <p style="font-weight:bold;color:#646375;"> Usuario: <span style="font-weight:normal;"> ${usuario || '-'} </span> </p>
    //                             <p style="font-weight:bold;color:#646375;"> Estatus: <span style="font-weight:normal;"> ${status || '-'} </span> </p>
    //                         </td>
    //                     </tr>
    //                 </table>
    //                 <table style="width: 100%;"> 
    //                     <thead>
    //                         ${ header.map(heading => `<th style="width:${heading.width}px;padding:10px 0;">${heading.name}</th>`).join('') }
    //                     </thead>
    //                 </table>
    //             </div>
    //         `,
    //         footerTemplate: `
    //             <div style="width: 100%; font-size:8px; padding:0 20px;">
    //                 <span style="color: #444;font-size:8px;float:right;">Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
    //             </div>
    //         `
    //     });

    //     await browser.close();

    //     // res.contentType('application/pdf');
    //     // res.send(pdfBuffer);


    //     const data = fs.readFileSync(pdfPath);
    //     res.contentType("application/pdf");
    //     res.setHeader('Content-Disposition', `attachment; filename=Reporte-${moment().format('DD-MM-YYYY-HH-mm')}.pdf`);
    //     res.send(data);

    //     fs.unlinkSync(pdfPath);
    // } catch (error) {
    //     console.log(error);
    //     await browser.close();
    //     res.status(500).json({ message: 'Error al generar el pdf', error: error.message })
    // } finally {
    //     if (browser) {
    //         await browser.close();
    //     }
    // }
}

