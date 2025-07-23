
const { Op } = require('sequelize');
const Actividad = require('../models/Actividad');
const { validationResult } = require('express-validator')

exports.getActividades = async (req, res) => {

    const { status, type, search } = req.query

    const where = {}

    if(status) (where.status = status)

    if(type) (where.type = type)


    if(search) ( 
        where[Op.or] = [
            { nombre: { [Op.like]: `%${search}%` } },
            { type: { [Op.like]: `%${search}%` } },
        ]
    )
    try {
        const actividades = await Actividad.findAll({ where }).catch(error => {
            res.status(500).json({ message: 'Error al obtener las actividades', error })
        })
        if(actividades){
            res.status(200).json({ actividades })
        }
    } catch (error) {
        res.status(500).json({ message: 'Error del servidor', error })
    }
}

exports.getActividad = async (req, res) => {
    const { id } = req.params
    try {
        const actividad = await Actividad.findOne({ where: { id } }).catch(error => {
            res.status(500).json({ message: 'Error al obtener la actividad', error })
        })
        if(actividad){
            res.status(200).json({ actividad })
        }
    } catch (error) {
        res.status(500).json({ message: 'Error del servidor', error })
    }
}

exports.createActividad = async (req, res) => {
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Todos los campos son obligatorios', errors: errors.array() });
    }

    const { nombre, type } = req.body
    try {
        const actividad = await Actividad.create({
            nombre,
            type,
        }).catch(error => {
            res.status(500).json({ message: 'Error al crear la actividad', error })
        })
        if(actividad){
            res.status(200).json({ actividad })
        }
    }
    catch (error) {
        res.status(500).json({ message: 'Error del servidor', error })
    }
}

exports.updateActividad = async (req, res) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Todos los campos son obligatorios', errors: errors.array() });
    }


    const {id} = req.params
    const {nombre, type, status} = req.body

    try{
        const actividad = await Actividad.findOne({where: {id}}).catch(error => {
            res.status(500).json({message: 'Error al obtener la actividad', error})
        })
        if(actividad){
            actividad.nombre = nombre ?? actividad.nombre
            actividad.type = type ?? actividad.type
            actividad.status = status ?? actividad.status
            await actividad.save()
            res.status(200).json({actividad})
        }
    }
    catch (error) {
        res.status(500).json({ message: 'Error del servidor', error })
    }
}

exports.deleteActividad = async (req, res) => {
    const {id} = req.params
    try{
        const actividad = await Actividad.findOne({where: {id}}).catch(error => {
            res.status(500).json({message: 'Error al obtener la actividad', error})
        })
        if(actividad){
            await actividad.update({status: 0})
            res.status(200).json({actividad})
        }
    }
    catch (error) {
        res.status(500).json({ message: 'Error del servidor', error })
    }
}