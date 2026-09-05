-- MySQL dump 10.13  Distrib 8.4.9, for Linux (aarch64)
--
-- Host: localhost    Database: health-coach-plan
-- ------------------------------------------------------
-- Server version	8.4.9

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `admins`
--

DROP TABLE IF EXISTS `admins`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admins` (
  `id` int NOT NULL AUTO_INCREMENT,
  `telegram_id` bigint NOT NULL,
  `telegram_username` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `role` enum('owner','admin') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'admin',
  `group_id` int DEFAULT NULL,
  `added_by` bigint DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_admins_telegram_id` (`telegram_id`),
  KEY `fk_admins_group` (`group_id`),
  CONSTRAINT `fk_admins_group` FOREIGN KEY (`group_id`) REFERENCES `client_groups` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `answer_edit_log`
--

DROP TABLE IF EXISTS `answer_edit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `answer_edit_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `round` int NOT NULL DEFAULT '1',
  `question_number` smallint NOT NULL,
  `question_text` text COLLATE utf8mb4_general_ci NOT NULL,
  `old_answer` text COLLATE utf8mb4_general_ci,
  `new_answer` text COLLATE utf8mb4_general_ci,
  `edited_by` bigint NOT NULL,
  `edited_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_answer_edit_log_client` (`client_id`),
  CONSTRAINT `fk_answer_edit_log_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bot_menu_commands`
--

DROP TABLE IF EXISTS `bot_menu_commands`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bot_menu_commands` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tier` enum('client','admin','owner') COLLATE utf8mb4_general_ci NOT NULL,
  `command` varchar(32) COLLATE utf8mb4_general_ci NOT NULL,
  `description` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `position` int NOT NULL DEFAULT '0',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_bot_menu_commands_tier_command` (`tier`,`command`)
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `client_groups`
--

DROP TABLE IF EXISTS `client_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_groups` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(64) COLLATE utf8mb4_general_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_client_groups_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `client_measurements`
--

DROP TABLE IF EXISTS `client_measurements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_measurements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `measurement_type_id` int NOT NULL,
  `value` decimal(6,2) NOT NULL,
  `recorded_at` date NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_client_measurements_client` (`client_id`),
  KEY `fk_client_measurements_type` (`measurement_type_id`),
  CONSTRAINT `fk_client_measurements_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_client_measurements_type` FOREIGN KEY (`measurement_type_id`) REFERENCES `measurement_types` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `client_recommendations`
--

DROP TABLE IF EXISTS `client_recommendations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_recommendations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `round` int NOT NULL,
  `training_plan` mediumtext COLLATE utf8mb4_general_ci,
  `nutrition_plan` mediumtext COLLATE utf8mb4_general_ci,
  `notes` mediumtext COLLATE utf8mb4_general_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_client_recommendations_round` (`client_id`,`round`),
  CONSTRAINT `fk_client_recommendations_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `client_snapshots`
--

DROP TABLE IF EXISTS `client_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_snapshots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `snapshot_data` json NOT NULL,
  `reason` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_by` bigint NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `restored_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_client_snapshots_client` (`client_id`),
  CONSTRAINT `fk_client_snapshots_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `client_surveys`
--

DROP TABLE IF EXISTS `client_surveys`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_surveys` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `round` int NOT NULL,
  `kind` enum('full','extend') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'full',
  `strategy_code` varchar(32) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` enum('in_progress','completed') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'in_progress',
  `started_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_client_surveys_round` (`client_id`,`round`),
  CONSTRAINT `fk_client_surveys_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `clients`
--

DROP TABLE IF EXISTS `clients`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clients` (
  `id` int NOT NULL AUTO_INCREMENT,
  `telegram_id` bigint NOT NULL,
  `telegram_username` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `name` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `city` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `birth_date` date NOT NULL,
  `wants_plan` tinyint(1) NOT NULL DEFAULT '0',
  `survey_strategy` varchar(32) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `group_id` int DEFAULT NULL,
  `status` varchar(32) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'card_created',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `last_measurement_reminder_at` timestamp NULL DEFAULT NULL,
  `measurements_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `measurement_reminders_enabled` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `telegram_id` (`telegram_id`),
  KEY `fk_clients_group` (`group_id`),
  CONSTRAINT `fk_clients_group` FOREIGN KEY (`group_id`) REFERENCES `client_groups` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `equipment_classes`
--

DROP TABLE IF EXISTS `equipment_classes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `equipment_classes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(64) COLLATE utf8mb4_general_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_equipment_classes_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `gym_equipment`
--

DROP TABLE IF EXISTS `gym_equipment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `gym_equipment` (
  `id` int NOT NULL AUTO_INCREMENT,
  `gym_id` int NOT NULL,
  `equipment_class_id` int DEFAULT NULL,
  `name` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_general_ci,
  `quantity_seen` int DEFAULT NULL,
  `photo_file_id` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `source_file` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `added_by` bigint NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_gym_equipment_source` (`gym_id`,`source_file`),
  KEY `fk_gym_equipment_class` (`equipment_class_id`),
  CONSTRAINT `fk_gym_equipment_class` FOREIGN KEY (`equipment_class_id`) REFERENCES `equipment_classes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_gym_equipment_gym` FOREIGN KEY (`gym_id`) REFERENCES `gyms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=63 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `gym_media`
--

DROP TABLE IF EXISTS `gym_media`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `gym_media` (
  `id` int NOT NULL AUTO_INCREMENT,
  `gym_id` int NOT NULL,
  `gym_equipment_id` int DEFAULT NULL,
  `minio_bucket` varchar(128) COLLATE utf8mb4_general_ci NOT NULL,
  `minio_key` varchar(500) COLLATE utf8mb4_general_ci NOT NULL,
  `content_type` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `size_bytes` int DEFAULT NULL,
  `source_telegram_file_id` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `uploaded_by` bigint NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_gym_media_key` (`minio_bucket`,`minio_key`(191)),
  KEY `fk_gym_media_gym` (`gym_id`),
  KEY `fk_gym_media_equipment` (`gym_equipment_id`),
  CONSTRAINT `fk_gym_media_equipment` FOREIGN KEY (`gym_equipment_id`) REFERENCES `gym_equipment` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gym_media_gym` FOREIGN KEY (`gym_id`) REFERENCES `gyms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=62 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `gyms`
--

DROP TABLE IF EXISTS `gyms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `gyms` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `type` enum('location','template') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'location',
  `location` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_by` bigint NOT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `measurement_types`
--

DROP TABLE IF EXISTS `measurement_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `measurement_types` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(64) COLLATE utf8mb4_general_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `unit` varchar(32) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `position` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_measurement_types_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `questionnaire_answers`
--

DROP TABLE IF EXISTS `questionnaire_answers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `questionnaire_answers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `round` int NOT NULL DEFAULT '1',
  `question_number` smallint NOT NULL,
  `question_text` text COLLATE utf8mb4_general_ci NOT NULL,
  `answer_text` text COLLATE utf8mb4_general_ci,
  `answered_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_questionnaire_answers_unique_answer` (`client_id`,`round`,`question_number`),
  CONSTRAINT `fk_questionnaire_answers_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=259 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `survey_questions`
--

DROP TABLE IF EXISTS `survey_questions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `survey_questions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(64) COLLATE utf8mb4_general_ci NOT NULL,
  `question_text` text COLLATE utf8mb4_general_ci NOT NULL,
  `question_type` enum('text','choice','yesno') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'text',
  `options` json DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_survey_questions_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `survey_strategies`
--

DROP TABLE IF EXISTS `survey_strategies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `survey_strategies` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(32) COLLATE utf8mb4_general_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_survey_strategies_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `survey_strategy_questions`
--

DROP TABLE IF EXISTS `survey_strategy_questions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `survey_strategy_questions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `strategy_id` int NOT NULL,
  `question_id` int NOT NULL,
  `position` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_strategy_question` (`strategy_id`,`question_id`),
  UNIQUE KEY `idx_strategy_position` (`strategy_id`,`position`),
  KEY `fk_ssq_question` (`question_id`),
  CONSTRAINT `fk_ssq_question` FOREIGN KEY (`question_id`) REFERENCES `survey_questions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ssq_strategy` FOREIGN KEY (`strategy_id`) REFERENCES `survey_strategies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=70 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping routines for database 'health-coach-plan'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-05 16:52:42
