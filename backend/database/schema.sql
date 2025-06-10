-- Schema Database Sistema Tesseramento Aoway Esport
-- Created: 2025-06-10
-- Volume: 10-15 tesseramenti/mese, 4 staff

-- Cleanup esistente
DROP TABLE IF EXISTS audit_log, chat_messages, documents, tesseramenti, users, staff CASCADE;

-- Tabella Staff (4 persone Aoway)
CREATE TABLE staff (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabella Users (richiedenti tesseramento)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    birth_date DATE,
    fiscal_code VARCHAR(16) UNIQUE,
    address TEXT,
    city VARCHAR(50),
    postal_code VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabella Tesseramenti (core business logic)
CREATE TABLE tesseramenti (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    assigned_staff_id INTEGER REFERENCES staff(id),
    
    -- Status workflow
    status VARCHAR(20) DEFAULT 'pending' 
        CHECK (status IN ('pending', 'in_review', 'payment_required', 'payment_received', 'completed', 'rejected')),
    
    -- Payment info
    payment_method VARCHAR(20) CHECK (payment_method IN ('paypal', 'bonifico')),
    payment_amount DECIMAL(10,2) DEFAULT 50.00,
    payment_status VARCHAR(20) DEFAULT 'pending' 
        CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
    payment_reference VARCHAR(100),
    payment_date TIMESTAMP,
    
    -- Metadata
    notes TEXT,
    rejection_reason TEXT,
    completion_date TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabella Documenti (CI + Codice Fiscale)
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    tesseramento_id INTEGER REFERENCES tesseramenti(id) ON DELETE CASCADE,
    document_type VARCHAR(20) NOT NULL CHECK (document_type IN ('carta_identita', 'codice_fiscale')),
    
    -- File info
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_url VARCHAR(500),
    file_size INTEGER,
    mime_type VARCHAR(100),
    
    -- Verification
    verified_by INTEGER REFERENCES staff(id),
    verified_at TIMESTAMP,
    is_approved BOOLEAN,
    verification_notes TEXT,
    
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabella Chat Messages (comunicazione staff-utente)
CREATE TABLE chat_messages (
    id SERIAL PRIMARY KEY,
    tesseramento_id INTEGER REFERENCES tesseramenti(id) ON DELETE CASCADE,
    
    -- Sender info
    sender_type VARCHAR(10) NOT NULL CHECK (sender_type IN ('staff', 'user')),
    sender_id INTEGER NOT NULL,
    sender_name VARCHAR(100) NOT NULL,
    
    -- Message content
    message TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'document', 'system')),
    
    -- Read status
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabella Audit Log (tracking completo)
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    tesseramento_id INTEGER REFERENCES tesseramenti(id),
    staff_id INTEGER REFERENCES staff(id),
    
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(20) NOT NULL,
    entity_id INTEGER,
    
    old_value JSONB,
    new_value JSONB,
    
    ip_address INET,
    user_agent TEXT,
    
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indici per performance
CREATE INDEX idx_tesseramenti_status ON tesseramenti(status);
CREATE INDEX idx_tesseramenti_staff ON tesseramenti(assigned_staff_id);
CREATE INDEX idx_tesseramenti_user ON tesseramenti(user_id);
CREATE INDEX idx_tesseramenti_created ON tesseramenti(created_at DESC);

CREATE INDEX idx_documents_tesseramento ON documents(tesseramento_id);
CREATE INDEX idx_chat_tesseramento ON chat_messages(tesseramento_id);
CREATE INDEX idx_chat_unread ON chat_messages(is_read, tesseramento_id);

-- Triggers per updated_at automatico
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON staff
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tesseramenti_updated_at BEFORE UPDATE ON tesseramenti
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed iniziale staff Aoway (password: aoway2025)
INSERT INTO staff (username, email, password_hash, full_name, role) VALUES
('admin_aoway', 'admin@aoway.esport', '$2b$10$rOzKqWMvYe7X4qGhczFfEeN9P6LXXqHQvF6XTbOqJxH8YGtUwZH6m', 'Admin Aoway Esport', 'admin'),
('staff_marco', 'marco@aoway.esport', '$2b$10$rOzKqWMvYe7X4qGhczFfEeN9P6LXXqHQvF6XTbOqJxH8YGtUwZH6m', 'Marco Rossi', 'staff'),
('staff_luca', 'luca@aoway.esport', '$2b$10$rOzKqWMvYe7X4qGhczFfEeN9P6LXXqHQvF6XTbOqJxH8YGtUwZH6m', 'Luca Bianchi', 'staff'),
('staff_anna', 'anna@aoway.esport', '$2b$10$rOzKqWMvYe7X4qGhczFfEeN9P6LXXqHQvF6XTbOqJxH8YGtUwZH6m', 'Anna Verdi', 'staff');

-- Dati di test
INSERT INTO users (email, full_name, phone, birth_date, fiscal_code, address, city, postal_code) VALUES
('mario.rossi@email.com', 'Mario Rossi', '+39 123 456 7890', '1995-03-15', 'RSSMRA95C15H501Z', 'Via Roma 123', 'Milano', '20100'),
('luigi.verdi@email.com', 'Luigi Verdi', '+39 098 765 4321', '1992-07-22', 'VRDLGU92L22F205X', 'Via Garibaldi 456', 'Roma', '00100');

INSERT INTO tesseramenti (user_id, assigned_staff_id, status, payment_method, payment_amount) VALUES
(1, 2, 'pending', 'paypal', 50.00),
(2, 3, 'in_review', 'bonifico', 50.00);

-- Views utili
CREATE VIEW dashboard_stats AS
SELECT 
    COUNT(*) as total_tesseramenti,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
    SUM(payment_amount) FILTER (WHERE payment_status = 'completed') as total_revenue
FROM tesseramenti;