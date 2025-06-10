const { query, transaction } = require('../config/database');

// Get all tesseramenti with filters
const getTesseramenti = async (req, res) => {
    try {
        const {
            status,
            assigned_staff_id,
            payment_status,
            search,
            page = 1,
            limit = 20,
            sort_by = 'created_at',
            sort_order = 'DESC'
        } = req.query;

        let whereConditions = [];
        let queryParams = [];
        let paramIndex = 1;

        // Build WHERE conditions
        if (status) {
            whereConditions.push(`t.status = $${paramIndex++}`);
            queryParams.push(status);
        }

        if (assigned_staff_id) {
            whereConditions.push(`t.assigned_staff_id = $${paramIndex++}`);
            queryParams.push(assigned_staff_id);
        }

        if (payment_status) {
            whereConditions.push(`t.payment_status = $${paramIndex++}`);
            queryParams.push(payment_status);
        }

        if (search) {
            whereConditions.push(`(u.full_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR u.fiscal_code ILIKE $${paramIndex})`);
            queryParams.push(`%${search}%`);
            paramIndex++;
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Validate sort parameters
        const validSortColumns = ['created_at', 'updated_at', 'full_name', 'status', 'payment_status'];
        const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
        const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Calculate offset
        const offset = (page - 1) * limit;

        // Main query
        const tesseramentiQuery = `
            SELECT 
                t.id,
                t.status,
                t.payment_method,
                t.payment_status,
                t.payment_amount,
                t.payment_reference,
                t.payment_date,
                t.notes,
                t.created_at,
                t.updated_at,
                t.completion_date,
                u.id as user_id,
                u.full_name,
                u.email,
                u.phone,
                u.fiscal_code,
                u.city,
                s.id as staff_id,
                s.full_name as staff_name,
                s.username as staff_username,
                (SELECT COUNT(*) FROM chat_messages cm WHERE cm.tesseramento_id = t.id AND cm.is_read = false AND cm.sender_type = 'user') as unread_messages,
                (SELECT COUNT(*) FROM documents d WHERE d.tesseramento_id = t.id) as documents_count,
                (SELECT COUNT(*) FROM documents d WHERE d.tesseramento_id = t.id AND d.is_approved = true) as approved_documents
            FROM tesseramenti t
            JOIN users u ON t.user_id = u.id
            LEFT JOIN staff s ON t.assigned_staff_id = s.id
            ${whereClause}
            ORDER BY t.${sortColumn} ${sortDirection}
            LIMIT $${paramIndex++} OFFSET $${paramIndex++}
        `;

        queryParams.push(limit, offset);

        // Count query for pagination
        const countQuery = `
            SELECT COUNT(*) as total
            FROM tesseramenti t
            JOIN users u ON t.user_id = u.id
            LEFT JOIN staff s ON t.assigned_staff_id = s.id
            ${whereClause}
        `;

        const [tesseramentiResult, countResult] = await Promise.all([
            query(tesseramentiQuery, queryParams.slice(0, -2)),
            query(countQuery, queryParams.slice(0, -2))
        ]);

        const total = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(total / limit);

        res.json({
            tesseramenti: tesseramentiResult.rows.map(row => ({
                ...row,
                unread_messages: parseInt(row.unread_messages),
                documents_count: parseInt(row.documents_count),
                approved_documents: parseInt(row.approved_documents)
            })),
            pagination: {
                current_page: parseInt(page),
                total_pages: totalPages,
                total_items: total,
                items_per_page: parseInt(limit),
                has_next: page < totalPages,
                has_prev: page > 1
            }
        });

    } catch (error) {
        console.error('Get tesseramenti error:', error);
        res.status(500).json({
            error: 'Errore nel caricamento dei tesseramenti'
        });
    }
};

// Get single tesseramento by ID
const getTesseramento = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query(`
            SELECT 
                t.*,
                u.id as user_id,
                u.full_name,
                u.email,
                u.phone,
                u.birth_date,
                u.fiscal_code,
                u.address,
                u.city,
                u.postal_code,
                u.created_at as user_created_at,
                s.id as staff_id,
                s.full_name as staff_name,
                s.username as staff_username,
                s.email as staff_email
            FROM tesseramenti t
            JOIN users u ON t.user_id = u.id
            LEFT JOIN staff s ON t.assigned_staff_id = s.id
            WHERE t.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Tesseramento non trovato'
            });
        }

        const tesseramento = result.rows[0];

        // Get documents
        const documentsResult = await query(`
            SELECT 
                d.*,
                vs.full_name as verified_by_name
            FROM documents d
            LEFT JOIN staff vs ON d.verified_by = vs.id
            WHERE d.tesseramento_id = $1
            ORDER BY d.uploaded_at DESC
        `, [id]);

        res.json({
            tesseramento,
            documents: documentsResult.rows
        });

    } catch (error) {
        console.error('Get tesseramento error:', error);
        res.status(500).json({
            error: 'Errore nel caricamento del tesseramento'
        });
    }
};

// Create new tesseramento (from web portal)
const createTesseramento = async (req, res) => {
    try {
        const userData = req.validatedData;

        const result = await transaction(async (client) => {
            // Check if user already exists
            let userResult = await client.query(
                'SELECT id FROM users WHERE email = $1 OR fiscal_code = $2',
                [userData.email, userData.fiscal_code]
            );

            let userId;
            
            if (userResult.rows.length > 0) {
                // User exists, update data
                userId = userResult.rows[0].id;
                await client.query(`
                    UPDATE users SET 
                        full_name = $1, phone = $2, birth_date = $3, 
                        address = $4, city = $5, postal_code = $6, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $7
                `, [
                    userData.full_name, userData.phone, userData.birth_date,
                    userData.address, userData.city, userData.postal_code, userId
                ]);
            } else {
                // Create new user
                userResult = await client.query(`
                    INSERT INTO users (email, full_name, phone, birth_date, fiscal_code, address, city, postal_code)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING id
                `, [
                    userData.email, userData.full_name, userData.phone, userData.birth_date,
                    userData.fiscal_code, userData.address, userData.city, userData.postal_code
                ]);
                userId = userResult.rows[0].id;
            }

            // Create tesseramento
            const tesseramentoResult = await client.query(`
                INSERT INTO tesseramenti (user_id, payment_method, payment_amount, status)
                VALUES ($1, $2, $3, 'pending')
                RETURNING *
            `, [userId, userData.payment_method, 50.00]);

            const tesseramento = tesseramentoResult.rows[0];

            // Log creation
            await client.query(`
                INSERT INTO audit_log (tesseramento_id, action, entity_type, entity_id, new_value)
                VALUES ($1, 'created', 'tesseramento', $2, $3)
            `, [tesseramento.id, tesseramento.id, JSON.stringify(tesseramento)]);

            return { tesseramento, userId };
        });

        console.log(`✅ New tesseramento created: ID ${result.tesseramento.id} for user ${userData.email}`);

        res.status(201).json({
            message: 'Tesseramento creato con successo',
            tesseramento: result.tesseramento,
            user_id: result.userId
        });

    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({
                error: 'Utente già registrato con questa email o codice fiscale'
            });
        }

        console.error('Create tesseramento error:', error);
        res.status(500).json({
            error: 'Errore nella creazione del tesseramento'
        });
    }
};

// Update tesseramento status
const updateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes, rejection_reason } = req.validatedData;
        const staffId = req.staff.id;

        const result = await transaction(async (client) => {
            // Get current tesseramento
            const currentResult = await client.query(
                'SELECT * FROM tesseramenti WHERE id = $1',
                [id]
            );

            if (currentResult.rows.length === 0) {
                throw new Error('Tesseramento non trovato');
            }

            const current = currentResult.rows[0];

            // Update tesseramento
            const updateData = {
                status,
                notes: notes || current.notes,
                rejection_reason: status === 'rejected' ? rejection_reason : null,
                completion_date: status === 'completed' ? new Date() : current.completion_date,
                updated_at: new Date()
            };

            const updateResult = await client.query(`
                UPDATE tesseramenti SET 
                    status = $1, notes = $2, rejection_reason = $3, 
                    completion_date = $4, updated_at = $5
                WHERE id = $6
                RETURNING *
            `, [
                updateData.status, updateData.notes, updateData.rejection_reason,
                updateData.completion_date, updateData.updated_at, id
            ]);

            // Log status change
            await client.query(`
                INSERT INTO audit_log (tesseramento_id, staff_id, action, entity_type, entity_id, old_value, new_value)
                VALUES ($1, $2, 'status_changed', 'tesseramento', $3, $4, $5)
            `, [
                id, staffId, id,
                JSON.stringify({ status: current.status }),
                JSON.stringify({ status, notes, rejection_reason })
            ]);

            return updateResult.rows[0];
        });

        console.log(`📝 Tesseramento ${id} status updated to ${status} by staff ${req.staff.username}`);

        // Emit real-time update
        req.io.to(`tesseramento_${id}`).emit('status_updated', {
            tesseramento_id: id,
            new_status: status,
            updated_by: req.staff.full_name,
            timestamp: new Date()
        });

        res.json({
            message: 'Stato aggiornato con successo',
            tesseramento: result
        });

    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({
            error: 'Errore nell\'aggiornamento dello stato'
        });
    }
};

// Assign tesseramento to staff
const assignToStaff = async (req, res) => {
    try {
        const { id } = req.params;
        const { staff_id } = req.body;
        const currentStaffId = req.staff.id;

        // Validate staff exists and is active
        const staffCheck = await query(
            'SELECT id, full_name FROM staff WHERE id = $1 AND is_active = true',
            [staff_id]
        );

        if (staffCheck.rows.length === 0) {
            return res.status(400).json({
                error: 'Staff non valido'
            });
        }

        const assignedStaff = staffCheck.rows[0];

        const result = await transaction(async (client) => {
            // Update assignment
            const updateResult = await client.query(`
                UPDATE tesseramenti SET 
                    assigned_staff_id = $1, 
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING *
            `, [staff_id, id]);

            if (updateResult.rows.length === 0) {
                throw new Error('Tesseramento non trovato');
            }

            // Log assignment
            await client.query(`
                INSERT INTO audit_log (tesseramento_id, staff_id, action, entity_type, entity_id, new_value)
                VALUES ($1, $2, 'assigned', 'tesseramento', $3, $4)
            `, [
                id, currentStaffId, id,
                JSON.stringify({ assigned_to: staff_id, assigned_by: currentStaffId })
            ]);

            return updateResult.rows[0];
        });

        console.log(`👤 Tesseramento ${id} assigned to staff ${assignedStaff.full_name} by ${req.staff.username}`);

        res.json({
            message: 'Tesseramento assegnato con successo',
            tesseramento: result
        });

    } catch (error) {
        console.error('Assign tesseramento error:', error);
        res.status(500).json({
            error: 'Errore nell\'assegnazione del tesseramento'
        });
    }
};

module.exports = {
    getTesseramenti,
    getTesseramento,
    createTesseramento,
    updateStatus,
    assignToStaff
};