const ValeSalida = require('../models/ValeSalida')
const DetalleSalida = require('../models/DetalleSalida')
const Insumo = require('../models/Insumos')
const { validationResult } = require('express-validator')
const moment = require('moment')
const { Op } = require("sequelize");
const Users = require('../models/Users')
const { solicitarPrestamo } = require('../email/Notificaciones')
const Permisos = require('../models/Permisos')
const Role = require('../models/Role')
const Prestamos = require('../models/Prestamos')
const db = require('../config/db')
const { Obra, Nivel, Zona, Personal, Actividad } = require('../models')
const Actividades = require('../models/Actividad')
const { getPagination, getPagingData } = require('../utils/paginacion')
const { io } = require('../services/socketService')
const Proyectos = require('../models/Proyectos')


exports.getValeSalida = async (req, res) => {

 
    try {
        const { statusVale } = req.query
        const {id} = req.user
        await Users.findOne({ where: { id }, include: [{ model: Role , include: Permisos}] })
        .then( async user => {
            // Almacenista
            if (user.role.permisos.some( item => item.permisos === 'ver vales' ))  {
                await ValeSalida.findAll({ 
                    include: [ 
                        {
                            model: DetalleSalida, 
                            include: [ 
                                { model: Insumo },
                                { model: Prestamos, 
                                    include: [
                                        { model: Users, attributes: ['nombre', 'apellidoPaterno'], as: 'residente' }
                                    ]
                                }
                            ],
                        },
                        {
                            model: Users,
                            as: 'user',
                            attributes: {
                                exclude: ['google_id', 'password', 'email']
                            }
                        }, 
                        {
                            model: Obra,
                            as: 'obra',
                        },
                        {
                            model: Nivel,
                            as: 'nivel',
                        },
                        {
                            model: Zona,
                            as: 'zona',
                        },
                        {
                            model: Actividades,
                            as: 'actividad',
                        },
                        {
                            model: Personal,
                            as: 'personal',
                            attributes: {
                                exclude: ['especialidad']
                            },
                        },
                    ], 
                    where: {
                    // statusVale: statusVale ? { [Op.eq]: statusVale  } : {[Op.ne]:  ''} }, 
                    statusVale: statusVale ? Number(statusVale) === 4 ? { [Op.or]: [ 3,  statusVale ] } : { [Op.eq]: statusVale  } : {[Op.ne]:  ''} }, 
                    order: [['id', 'DESC']] 
                }).then(valeSalida => {
                    res.status(200).json({ valeSalida })
                })
                .catch(error => {
                    res.status(500).json({ message: 'Error al obtener los vale de salida', error: error.message })
                })
            // Usuario regular
            }else{
                await ValeSalida.findAll({ include: [ 
                        {
                            model: DetalleSalida, 
                            include: [ 
                                { model: Insumo },
                                { model: Prestamos, 
                                    include: [
                                        { model: Users, attributes: ['nombre', 'apellidoPaterno'], as: 'residente' }
                                    ]
                                }
                            ],
                        },
                        {
                            model: Users,
                            as: 'user',
                            attributes: {
                                exclude: ['google_id', 'password', 'email']
                            }
                        }, 
                        {
                            model: Obra,
                            as: 'obra',
                        },
                        {
                            model: Nivel,
                            as: 'nivel',
                        },
                        {
                            model: Zona,
                            as: 'zona',
                        },
                        {
                            model: Actividades,
                            as: 'actividad',
                        },
                        {
                            model: Personal,
                            as: 'personal',
                            attributes: {
                                exclude: ['especialidad']
                            },
                        },
                    ], 
                    where: {
                    statusVale: statusVale ? Number(statusVale) === 4 ? { [Op.or]: [ 3,  statusVale ] } : { [Op.eq]: statusVale  } : {[Op.ne]:  ''}, userId: user.id }, 
                    // statusVale: statusVale ? { [Op.eq]: statusVale  } : {[Op.ne]:  ''}, userId: user.id }, 
                    order: [['id', 'DESC']] })
                .then(valeSalida => {
                    res.status(200).json({ valeSalida })
                })            
                .catch(error => {
                    res.status(500).json({ message: 'Error al obtener los vale de salida', error: error.message })
                })
            }
        })
        .catch(error => {
            res.status(500).json({ message: 'Error al obtener el usuario', error: error.message })
        })
    } catch (error) {
        console.log('Error en getValeSalida:', error);
        res.status(500).json({ message: 'Error del servidor', error: error.message })
    }
}

exports.getCountValeSalida = async (req, res) => {

    const { id } = req.user
    let where = {}


    const { type } = req.query

    switch (type) {
        case "hoy":
            where = {
                ...where,
                createdAt: {
                    [Op.between]: [moment().startOf('day').toDate(), moment().endOf('day').toDate()]
                }
            }
        break;
        case "semana":
            where = {
                ...where,
                createdAt: {
                    [Op.between]: [moment().startOf('week').toDate(), moment().endOf('week').toDate()]
                }
            }
        break;
        case "mes":
            where = {
                ...where,
                createdAt: {
                    [Op.between]: [moment().startOf('month').toDate(), moment().endOf('month').toDate()]
                }
            }
        break;
        default:
            where = { ...where }
        break;
    }


    try {
        await Users.findOne({ where: { id }, include: [{ model: Role , include: Permisos}]})
        .then( async user => {
            
            if( user.role.permisos.some( item => item.permisos === 'ver vales' ) ){
                delete where.userId
            }else{
                where.userId = user.id
                
            }
            await ValeSalida.findAll({where}).then(valeSalida => {
                // contar vale de salida por estatus
                const countValeSalida = valeSalida.reduce((acc, valeSalida) => {
                    if (valeSalida.statusVale === 1) {
                        acc.nuevo = acc.nuevo + 1
                    } else if (valeSalida.statusVale === 2) {
                        acc.parcialAbierto = acc.parcialAbierto + 1
                    } else if (valeSalida.statusVale === 3) {
                        acc.parcialCerrado = acc.parcialCerrado + 1
                    } else if (valeSalida.statusVale === 4) {
                        acc.entregado = acc.entregado + 1
                    } else if (valeSalida.statusVale === 5) {
                        acc.cancelado = acc.cancelado + 1
                    } else if (valeSalida.statusVale === 7) {
                        acc.cerrado = acc.cerrado + 1
                    }
                    return acc
                }, { nuevo: 0, parcialAbierto: 0, parcialCerrado: 0, entregado: 0, cancelado: 0, cerrado: 0 })
    
                countValeSalida.todos = valeSalida.length
                res.status(200).json({ countValeSalida })
            })
            .catch(error => {
                res.status(500).json({ message: 'Error al obtener los vale de salida', error: error.message })
            })
        })
    }
    catch (error) {
        console.log('Error en getCountValeSalida:', error);
        res.status(500).json({ message: 'Error del servidor', error: error.message })
    }
}

exports.createValeSalida = async (req, res) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Todos los campos son obligatorios', errors: errors.mapped() });
    }
    const { almacenId, obraId, nivelId, zonaId, actividadId, personalId, statusVale, listaInsumos } = req.body
    const userId = req.user.id
    const t = await db.transaction();
    try {

       

        await ValeSalida.create({
            almacenId,
            obraId,
            nivelId,
            zonaId,
            actividadId,
            personalId,
            statusVale,
            userId,
        })
        .then( async valeSalida => {
            if(valeSalida){                    
                listaInsumos.map( async insumo => {
                    if (insumo.residentePrestamo){
                        await Prestamos.create({
                            belongsTo: userId,
                            deliverTo: insumo.residentePrestamo,
                            valeSalidaId: valeSalida.id,
                        })


                        .then( async prestamo => {
                            await DetalleSalida.create({
                                valeSalidaId: valeSalida.id,
                                insumoId: insumo.id,
                                cantidadSolicitada: insumo.cantidadSolicitada,
                                costo: insumo.costo,
                                total: insumo.total,
                                prestamoId: prestamo.id
                            })
                        
                        })
                        
                        .catch( error => {
                            res.status(500).json({ message: "Error al generar el prestamo", error: error.message })
                        })

                        const usuario = await Users.findOne({ where: { id: userId } })
                        const actividad = await Actividad.findOne({ where: { id: actividadId } })
                        const responsable = await Users.findOne({ where: { id: insumo.residentePrestamo } })

                        await solicitarPrestamo(usuario.dataValues, actividad.dataValues, responsable.dataValues)
                    }else{
                        await DetalleSalida.create({
                            valeSalidaId: valeSalida.id,
                            insumoId: insumo.id,
                            cantidadSolicitada: insumo.cantidadSolicitada,
                            costo: insumo.costo,
                            total: insumo.total,
                        })
                        .catch( ( error ) => {
                            res.status(500).json({ message: 'Error al agregar insumo al vale', error: error.message })
                        })
                    }
            })
                
                await ValeSalida.findOne({ where: { id: valeSalida.id }, include: [ { model: DetalleSalida, include:Insumo}, 'user', 'obra', 'nivel', 'zona', 'actividad', 'personal'] })
                .then( valeSalida => {

                    // Buscar usuarios con rol almacen
                    Users.findAll({ where: { tipoUsuario_id: 3 } })
                    .then(almacenistas => {
                        const almacenistasArray = []
                        almacenistas.map(almacenista => {
                            almacenistasArray.push(almacenista.dataValues.id)
                            
                        })
                        
                    })
                    .catch(error => {
                        console.log(error.message);
                    })

                    
                    io.emit('nuevo-vale', ( valeSalida ))
                    res.status(200).json({ valeSalida })
                })
                .catch(error => {
                    res.status(500).json({ message: 'Error al crear el vale de salida', error: error.message })
                })
                
            }else{
                res.status(404).json({ message: 'No hay vale de salida o no se creo correctamente' })
            }
        })
        .catch(error => {
            res.status(500).json({ message: 'Error al crear el vale de salida', error: error.message })
        })
    }
    catch (error) {
        console.log('Error en createValeSalida:', error);
        res.status(500).json({ message: 'Error del servidor', error: error.message })
    }
}

exports.updateValeSalida = async (req, res) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Todos los campos son obligatorios', errors: errors.map() });
    }


    const { id } = req.params
    const { almacenId, obraId, nivelId, zonaId, actividadId, personalId, statusVale, listaInsumos } = req.body
    const userId = req.user.id

    const { listadoActualizar } = req.body
    
    try {
        const valeSalida = await ValeSalida.findOne({ where: { id }, include: [ { model: DetalleSalida, include:Insumo}, 'user', 'obra', 'nivel', 'zona', 'actividad', 'personal'] }).catch(error => {
            res.status(500).json({ message: 'Error al obtener el vale de salida', error: error.message })
        })

        if (valeSalida){
            if( valeSalida.statusVale === 1 || valeSalida.statusVale === 2 && valeSalida.userId === userId){
                    valeSalida.almacenId = almacenId ?? valeSalida.almacenId 
                    valeSalida.obraId = obraId ?? valeSalida.obraId
                    valeSalida.nivelId = nivelId ?? valeSalida.nivelId
                    valeSalida.zonaId = zonaId ?? valeSalida.zonaId
                    valeSalida.actividadId = actividadId ?? valeSalida.actividadId
                    valeSalida.personalId = personalId ?? valeSalida.personalId
                    valeSalida.statusVale = statusVale ?? valeSalida.statusVale
                    // valeSalida.userId = userId ?? valeSalida.userId

                    const detalleSalida = await DetalleSalida.destroy({ where: { valeSalidaId: valeSalida.id } }).catch(error => {
                        res.status(500).json({ message: 'Error al eliminar los detalles del vale de salida', error: error.message })
                    })
                    if(detalleSalida){
                        const detalleSalida = await DetalleSalida.bulkCreate(listaInsumos.map(insumo => ({
                            valeSalidaId: valeSalida.id,
                            insumoId: insumo.id,
                            cantidadSolicitada: insumo.cantidadSolicitada,
                        })))
                        res.status(200).json({ valeSalida, detalleSalida })
                    }else {
                        res.status(404).json({ message: 'Error al agregar los insumos al vale' })
                    }
                
            }else{
                // actualizar la cantidadEntregada con respecto a la listadoActualizar de DetalleSalida
                const detalleSalida = await DetalleSalida.findAll({ where: { valeSalidaId: valeSalida.id } }).catch(error => {
                    res.status(500).json({ message: 'Error al obtener los detalles del vale de salida', error: error.message })
                })
                if(detalleSalida){
                    detalleSalida.forEach(async (detalle) => {
                        const insumo = listadoActualizar.find(insumo => insumo.id === detalle.insumoId)
                        if(insumo){
                            detalle.cantidadEntregada = insumo.cantidadEntregada
                            await detalle.save()
                        }
                    })
                }
            }
        } else {
            res.status(404).json({ message: 'No hay vale de salida' })
        }

    } catch (error) {
        console.log('Error en updateValeSalida:', error);
        res.status(500).json({ message: 'Error del servidor', error: error.message })
    }
}

exports.deliverValeSalida = async (req, res) => {

    const { id, valeSalidaId, insumoId, cantidadEntregada, comentarios } = req.body

    try {
        const detalleSalida = await DetalleSalida.findOne({ where: { id, insumoId, valeSalidaId } }).catch(error => {
            res.status(500).json({ message: 'Error al obtener el insumo', error: error.message })
        })

        // obtener vales de salida incluir insumos
        const valeSalida = await ValeSalida.findOne({ where: { id: valeSalidaId }, include: [ { model: DetalleSalida, include:Insumo}, 'user', 'obra', 'nivel', 'zona', 'actividad', 'personal'] }).catch(error => {
            res.status(500).json({ message: 'Error al obtener el vale de salida', error: error.message })
        })

        if(valeSalida.statusVale !== 7 && valeSalida.statusVale !== 5 ){ // Si el vale de salida no se ha subido a enk o esta cancelado
            if(detalleSalida){ // Si hay detalle salida en el vale
                if(Number(detalleSalida.cantidadEntregada) + Number(cantidadEntregada) > Number(detalleSalida.cantidadSolicitada)){ // validar si la cantidad entregada es mayor a la cantidad solicitada
                    res.status(400).json({ message: 'La cantidad a entregar es mayor a la cantidad del insumo' })
                }else{
                    detalleSalida.cantidadEntregada = Number(detalleSalida.cantidadEntregada) + Number(cantidadEntregada)
                        if(Number(detalleSalida.cantidadSolicitada > 0 && Number(detalleSalida.cantidadSolicitada) > Number(detalleSalida.cantidadEntregada))){
                            detalleSalida.status = 2 // Parcialmente Entregado
                        }else{
                            // si la cantidad entregada es igual a la cantidad solicitada se ha entregado
                            if(Number(detalleSalida.cantidadSolicitada) === Number(detalleSalida.cantidadEntregada)){
                                detalleSalida.status = 3 // Entregado
                            }
                        }

                    detalleSalida.comentarios = comentarios ?? null
                    await detalleSalida.save()

                    // Vale Salida
                    await ValeSalida.findOne({ where: { id: valeSalidaId }, include: [{model: DetalleSalida}, 'actividad'] })
                    .then( async valeSalida => {
                        if (valeSalida.detalle_salidas.every( item => item.status === 3 )) { // si todos los detalles estan entregados
                            valeSalida.statusVale = 4
                        } else if (valeSalida.detalle_salidas.every( item => item.status === 1 )) { // si todos los detalles no se han entregado 
                            valeSalida.statusVale = 1
                        } else if (valeSalida.detalle_salidas.every( item => item.status === 3 || item.status === 4 || item.status === 6)){ // si todos estan cerrados o 
                            valeSalida.statusVale = 3
                        } else if (valeSalida.detalle_salidas.some( item => item.status !== 1 )) { // si alguno de los detalles se ha entregado
                            valeSalida.statusVale = 2
                        } else if (valeSalida.detalle_salidas.some( item => item.status === 4 )) { // si alguno de los detalles se ha cancelado
                            valeSalida.statusVale = 2
                        } 
                        await valeSalida.save()
                        res.status(200).json({ valeSalida, detalleSalida })
                    })
                    .catch(error => {
                        res.status(500).json({ message: 'Error al obtener el vale de salida', error: error.message })
                    })
                }         
            } else {
                res.status(400).json({ message: "No se encontro el detalle del vale de salida"})
            }
          
        } else {
            res.status(400).json({ message: "El vale se ha cerrado o ya se canceló."})
        }
    } catch (error) {
        res.status(500).json({ message: 'Error del servidor', error: error.message })
    }
}

// Registrar Enkontrol
exports.registrarValeSalida = async (req, res) => {
    const { id, salidaEnkontrol } = req.body
    try {
        await ValeSalida.findOne({ where: { id }, include: [ { model: DetalleSalida, include:Insumo}, 'user', 'obra', 'nivel', 'zona', 'actividad', 'personal'] })
        .then( async valeSalida => {

            if(valeSalida.statusVale === 2 || valeSalida.statusVale === 3  || valeSalida.statusVale === 4){
                // 4 Entregado // 3 Parcial Cerrado // 2 Parcial Abierto
                if (valeSalida.detalle_salidas.some( item => item.status === 6 )) { // si todos los detalles estan entregados
                    valeSalida.statusVale = 6
                } else {
                    valeSalida.statusVale = 7
                }
                valeSalida.salidaEnkontrol = salidaEnkontrol

                await valeSalida.save()

                    await DetalleSalida.findAll({ where: { valeSalidaId: id } })
                    .then( async detalleSalida => {
                        detalleSalida.forEach( async item => {
                            if(item.status === 2){
                                item.status = 5 // Cerrado
                                item.comentarios = 'Cerrado automaticamente por haber subido a Enkontrol'
                            }else if(item.status === 1){
                                item.status = 4 // Cancelado
                                item.comentarios = 'Cancelado automaticamente por haber subido a Enkontrol'
                            }
                            await item.save()
                        })
                    })
                    .then( async (detalleSalida) => {
                        await ValeSalida.findOne({ where: { id }, include: [ { model: DetalleSalida, include:Insumo}, 'user', 'obra', 'nivel', 'zona', 'actividad', 'personal'] })
                        .then( async valeSalida => {
                            res.status(200).json({ valeSalida, detalleSalida })
                        }).catch(error => {
                            res.status(500).json({ message: 'Error al obtener el vale de salida', error: error.message })
                        })
                    })
                    .catch(error => {
                        res.status(500).json({ message: 'Error al completar el vale de salida', error: error.message })
                    }) 
            } else {
                res.status(400).json({ message: "El vale debe ser entregado completamente o paracialmente."})
            }            
        }).catch(error => {
            res.status(500).json({ message: 'Error al obtener el vale de salida', error: error.message })
        })    
    } catch (error) {
        res.status(500).json({ message: 'Error del servidor', error: error.message })
    }
}

// Cancelar vale de salida y se cancelan los detalles del vale de salida
exports.cancelValeSalida = async (req, res) => {
    const { id, comentarios } = req.body
    try {
        await ValeSalida.findOne({ where: { id }, include: [ { model: DetalleSalida, include:Insumo }, 'user', 'obra', 'nivel', 'zona', 'actividad', 'personal'] })
        .then( async valeSalida => {
            if(valeSalida.statusVale === 1 || valeSalida.statusVale === 2){
                valeSalida.statusVale = 5
                valeSalida.comentarios = comentarios
                // cancelar detalles de salida
                await DetalleSalida.update({ status: 4 , comentarios , salidaEnkontrol: null}, { where: { valeSalidaId: id } })
                .then( async () => {
                    await valeSalida.save()
                    valeSalida.detalle_salidas.map (item => item.status = 4)
                    res.status(200).json({ valeSalida })
                })
                .catch(error => {
                    res.status(500).json({ message: 'Error al cancelar el vale de salida', error: error.message })
                })      

            }else {
                res.status(400).json({ message: "El vale debe estar en estatus 1 o 2."})
            }            
        }).catch(error => {
            res.status(500).json({ message: 'Error al obtener el vale de salida', error: error.message })
        })    
    } catch (error) {
        res.status(500).json({ message: 'Error del servidor', error: error.message })
    }
}

// Cancelar detalle de salida
exports.cancelDetalleSalida = async (req, res) => {
    const { id, comentarios } = req.body
    try {
        await DetalleSalida.findOne({ where: { id } })
        .then( async detalleSalida => {
            if(detalleSalida.status === 1){
                detalleSalida.status = 4
                detalleSalida.comentarios = comentarios
                await detalleSalida.save()

            } else if (detalleSalida.status === 2){
                detalleSalida.status = 6
                detalleSalida.comentarios = comentarios
                await detalleSalida.save()
            }
            else {
                res.status(400).json({ message: "No se debe haber entregado ningún insumo para cancelar."})
            }     
            
            // Valida si todos los insumos se han cancelado entonces cancela el vale de salida
            await ValeSalida.findOne({ where: { id: detalleSalida.valeSalidaId }, include: [ { model: DetalleSalida, include:Insumo }] })
            .then( async valeSalida => {
                if(valeSalida.detalle_salidas.every( item => item.status === 4 )){
                    valeSalida.statusVale = 5
                    await valeSalida.save()
                }else if (valeSalida.detalle_salidas.every( item => item.status === 3 || item.status === 4 || item.status === 6)){
                    valeSalida.statusVale = 3
                    await valeSalida.save()
                }
                
                res.status(200).json({ detalleSalida, valeSalida })
            }).catch(error => {
                res.status(500).json({ message: 'Error al obtener el vale de salida', error: error.message })
            })
        }).catch(error => {
            res.status(500).json({ message: 'Error al obtener el detalle de salida', error: error.message })
        })    
    } catch (error) {
        res.status(500).json({ message: 'Error del servidor', error: error.message })
    }
}

// Entregar vale de salida sin subir a enkontrol
exports.completeValeSalida = async (req, res) => {
    const { id } = req.body

    try {
        await ValeSalida.findOne({ where: { id }, include: [ { model: DetalleSalida, include:Insumo }, 'user', 'obra', 'nivel', 'zona', 'actividad', 'personal'] })
        .then( async valeSalida => {

            if(valeSalida.statusVale === 1 || valeSalida.statusVale === 2 || valeSalida.statusVale === 3){
                valeSalida.statusVale = 4
                await valeSalida.save()
                // completar detalles de salida
                await DetalleSalida.findAll({ where: { valeSalidaId: id } })
                .then( async detalleSalida => {
                    detalleSalida.forEach( async item => {
                        item.status = 3
                        item.cantidadEntregada = item.cantidadSolicitada
                        await item.save()
                    })

                    await ValeSalida.findOne({ where: { id }, include: [ { model: DetalleSalida, include:Insumo}, 'user', 'obra', 'nivel', 'zona', 'actividad', 'personal'] })
                        .then( async valeSalida => {

                            valeSalida.detalle_salidas.map (item => item.status = 3)
                            res.status(200).json({ valeSalida })
                        }).catch(error => {
                            res.status(500).json({ message: 'Error al obtener el vale de salida', error: error.message })
                        })     
                }).catch(error => {
                    res.status(500).json({ message: 'Error al obtener los detalles de salida', error: error.message })
                })

                        
            } else {
                res.status(400).json({ message: "El vale no debe estar cancelado o completado"})
            }            
        })
        .catch(error => {
            res.status(500).json({ message: 'Error al obtener el vale de salida', error: error.message })
        })
    } catch (error) {
        res.status(500).json({ message: 'Error del servidor', error: error.message })
    }
}

// Cerrar Vale
exports.cerrarValesAbiertos = async (req, res) => {
    
    try { 
        // Validar todos los vales abiertos y si fueron creados un dia antes, cerrarlos
        await ValeSalida.findAll({ where: { 
            [Op.or]: [
                { statusVale: 1 },
                { statusVale: 2 },
            ]
        }}).then( async valeSalida => {

            valeSalida.map( async item => {

                if(item.fecha < moment().subtract(8, 'h') ){
                    // Si es nuevo, se cancela y todos los detalles se cancelan
                    if( item.statusVale === 1){
                        item.statusVale = 5
                        await DetalleSalida.update({ status: 4, comentarios: "Cancelado, se agoto el tiempo de espera, por el sistema" }, { where: { valeSalidaId: item.id } })
                        await item.save()

                    // Si es parcialmente abierto 
                    } else if ( item.statusVale === 2){
                        item.statusVale = 3 // Parcialmente Cerrado

                        // si detalle de salida esta en estatus 1, cancelarlo
                        await DetalleSalida.update({ status: 5, comentarios: "Cancelado, se agoto el tiempo de espera, por el sistema"},{ where: { valeSalidaId: item.id, status: 1 } })

                        // Si el detalle de salida esta en estatus 2, cambiarlo a estatus 6
                        await DetalleSalida.update({ status: 6, comentarios: "Cancelado, se agoto el tiempo de espera, por el sistema"},{ where: { valeSalidaId: item.id, status: 2 } })
                        await item.save()

                    }
                }
            })
        }).catch(error => {
            res.status(500).json({ message: 'Error al obtener los vales', error: error.message })
        })
    }
    catch (error) {
        res.status(500).json({ message: 'Error del servidor', error: error.message })
    }
}

// V2 2025

exports.getDetalleValeSalida = async (req, res) => {
    const { id } = req.query

    try {
        
        const detalle = await DetalleSalida.findAll({
            include: [
                { model: Insumo },
                { model: Prestamos, 
                    include: [
                        { model: Users, attributes: ['nombre', 'apellidoPaterno'], as: 'residente' }
                    ]
                }
            ],
            where: { '$detalle_salida.valeSalidaId$': id }
        })
    
        res.status(200).json({ detalle })

    } catch (error) {
        console.error('Error al obtener el detalle del vale de salida:', error);
        res.status(500).json({ message: 'Error al obtener el detalle del vale de salida', error: error.message })
    }
}

exports.getAllValesSalida = async (req, res) => {
    try {
        const { page, limit:size, search, status:statusVale, dateInit, dateEnd, sort, proyectoId} = req.query

        const proyecto = await Proyectos.findOne({ where: { id: proyectoId } })

        if( !proyecto ) {
            return res.status(404).json({ message: 'Proyecto no encontrado' });
        }

        const etapas = await proyecto.getEtapas()
        let obras = []

        for (let i = 0; i < etapas.length; i++) {
            const obra = await etapas[i].getObras()
            obras.push(obra)
        }
    
        const obraId = obras.map( item => item.map( item => item.id)).flat()


        const { limit, offset } = getPagination(page, size)

        let userType = null

        const {id} = req.user

        const searchValue = search ? 
        { 
            [Op.or]: [
                { '$vale_salida.id$' : { [Op.like]: '%' + search + '%' } },
                { '$user.nombre$': { [Op.like ]: `%${search}%` } },
                { '$user.apellidoPaterno$': { [Op.like]: `%${search}%` } },
                { '$user.apellidoMaterno$': { [Op.like]: `%${search}%` } },
                { '$personal.nombre$': { [Op.like]: `%${search}%` } },
                { '$personal.apellidoPaterno$': { [Op.like]: `%${search}%` } },
                { '$personal.apellidoMaterno$': { [Op.like]: `%${search}%` } },
                { '$actividad.nombre$': { [Op.like]: `%${search}%` } },
            ] 
            
        } : null

        const status = statusVale? statusVale.map( item => parseInt(item)) : null
        const searchStatus = statusVale ?
            {
                '$vale_salida.statusVale$': { [Op.or]: status }
            } : null

        const searchDate = dateInit && dateEnd ? {
            '$vale_salida.fecha$' : {[Op.between] : [ moment(dateInit).startOf('day').format("YYYY-MM-DD HH:mm:ss"),  moment(dateEnd).endOf('day').format("YYYY-MM-DD HH:mm:ss") ]}
        } : null


        const searchObra = obraId.length > 0 ? {
            '$vale_salida.obraId$': { [Op.in]: obraId }
        } : null


        const users = await Users.findOne({ where: { id }, include: [{ model: Role , include: Permisos }]})

        if (!users) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        userType = users.role.permisos.some( item => item.permisos === 'ver vales') ? 
                { '$vale_salida.statusVale$': { [Op.ne]: 8 } } 
                : 
                {'$vale_salida.userId$': users.id}



            const valesSalida = await ValeSalida.findAndCountAll({ 
                    include: [ 
                        {
                            model: Users,
                            as: 'user',
                            attributes: {
                                exclude: ['password', 'email', 'telefono', 'tipoUsuario_id', 'puesto', 'google_id', 'status', 'suAdmin', 'createdAt', 'updatedAt']
                            },
                            required: false,
                        }, 
                        {
                            model: Obra,
                            as: 'obra',
                        },
                        {
                            model: Nivel,
                            as: 'nivel',
                        },
                        {
                            model: Zona,
                            as: 'zona',
                        },
                        {
                            model: Actividades,
                            as: 'actividad',
                        },
                        {
                            model: Personal,
                            as: 'personal',
                            attributes: {
                                exclude: ['especialidad', 'createdAt', 'updatedAt', 'deletedAt']
                            },
                        },
                    ],             
                    order: [['id', `${sort ? sort : 'DESC'}`]],
                    distinct: true,                
                    where: {[Op.and]: [searchValue, searchStatus, searchDate, userType, searchObra ]}, 
                    limit: limit,
                    offset:offset,
                })

            if (!valesSalida) {
                return res.status(404).json({ message: 'No se encontraron vales de salida' });
            }

            const response = getPagingData(valesSalida, page, limit)                
            res.status(200).json({ valeSalida: response })
        
    } catch (error) {
        console.error('Error en getAllValesSalida:', error);
        res.status(500).json({ message: 'Error del servidor', error: error.message })
        
    }
}

