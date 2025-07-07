/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.6.21-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: localhost    Database: project_management
-- ------------------------------------------------------
-- Server version	10.6.21-MariaDB-0ubuntu0.22.04.2

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `chat_participants`
--

DROP TABLE IF EXISTS `chat_participants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_participants` (
  `ParticipantID` int(11) NOT NULL AUTO_INCREMENT,
  `ChatID` int(11) NOT NULL,
  `UserID` int(11) NOT NULL,
  PRIMARY KEY (`ParticipantID`),
  KEY `chat_participants_ibfk_1` (`ChatID`),
  KEY `chat_participants_ibfk_2` (`UserID`),
  CONSTRAINT `chat_participants_ibfk_1` FOREIGN KEY (`ChatID`) REFERENCES `chats` (`ChatID`) ON DELETE CASCADE,
  CONSTRAINT `chat_participants_ibfk_2` FOREIGN KEY (`UserID`) REFERENCES `users` (`UserID`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `chats`
--

DROP TABLE IF EXISTS `chats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `chats` (
  `ChatID` int(11) NOT NULL AUTO_INCREMENT,
  `ProjectID` int(11) DEFAULT NULL,
  `Name` varchar(255) NOT NULL,
  `CreatedAt` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`ChatID`),
  KEY `chats_ibfk_1` (`ProjectID`),
  CONSTRAINT `chats_ibfk_1` FOREIGN KEY (`ProjectID`) REFERENCES `projects` (`ProjectID`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `comments`
--

DROP TABLE IF EXISTS `comments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `comments` (
  `MessageID` int(11) NOT NULL AUTO_INCREMENT,
  `UserID` int(11) NOT NULL,
  `DiscussionID` int(11) NOT NULL,
  `Content` text NOT NULL,
  `Timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`MessageID`),
  KEY `UserID` (`UserID`),
  KEY `DiscussionID` (`DiscussionID`),
  CONSTRAINT `comments_ibfk_1` FOREIGN KEY (`UserID`) REFERENCES `users` (`UserID`) ON DELETE CASCADE,
  CONSTRAINT `comments_ibfk_2` FOREIGN KEY (`DiscussionID`) REFERENCES `discussion` (`DiscussionID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `discussion`
--

DROP TABLE IF EXISTS `discussion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `discussion` (
  `DiscussionID` int(11) NOT NULL AUTO_INCREMENT,
  `TaskID` int(11) NOT NULL,
  PRIMARY KEY (`DiscussionID`),
  KEY `TaskID` (`TaskID`),
  CONSTRAINT `discussion_ibfk_1` FOREIGN KEY (`TaskID`) REFERENCES `tasks` (`TaskID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `messages`
--

DROP TABLE IF EXISTS `messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `messages` (
  `MessageID` int(11) NOT NULL AUTO_INCREMENT,
  `ChatID` int(11) NOT NULL,
  `SenderID` int(11) NOT NULL,
  `Content` text NOT NULL,
  `Timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  `IsRead` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`MessageID`),
  KEY `messages_ibfk_1` (`ChatID`),
  KEY `messages_ibfk_2` (`SenderID`),
  CONSTRAINT `messages_ibfk_1` FOREIGN KEY (`ChatID`) REFERENCES `chats` (`ChatID`) ON DELETE CASCADE,
  CONSTRAINT `messages_ibfk_2` FOREIGN KEY (`SenderID`) REFERENCES `users` (`UserID`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `milestones`
--

DROP TABLE IF EXISTS `milestones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `milestones` (
  `MilestoneID` int(11) NOT NULL AUTO_INCREMENT,
  `ProjectID` int(11) NOT NULL,
  `Description` text NOT NULL,
  `StartDate` date NOT NULL,
  `CompletionDate` date NOT NULL,
  `Stakeholder` varchar(255) DEFAULT NULL,
  `Teams` varchar(255) DEFAULT NULL,
  `Budget` int(11) DEFAULT NULL,
  PRIMARY KEY (`MilestoneID`),
  KEY `ProjectID` (`ProjectID`),
  CONSTRAINT `milestones_ibfk_1` FOREIGN KEY (`ProjectID`) REFERENCES `projects` (`ProjectID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `projects`
--

DROP TABLE IF EXISTS `projects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `projects` (
  `ProjectID` int(11) NOT NULL AUTO_INCREMENT,
  `ProjectName` varchar(255) NOT NULL,
  `ManagerID` int(11) DEFAULT NULL,
  `StartDate` date NOT NULL,
  `EndDate` date NOT NULL,
  `Description` text DEFAULT NULL,
  `Objective` text DEFAULT NULL,
  `RisksIssues` text DEFAULT NULL,
  `Financials` text DEFAULT NULL,
  `ProjectType` enum('ai_ml','game_dev','mission_critical','mobile_app','embedded') DEFAULT NULL,
  `TeamIDs` varchar(255) DEFAULT NULL,
  `Status` enum('Approved','Not approved') NOT NULL DEFAULT 'Not approved',
  `ApprovalRequested` tinyint(1) NOT NULL DEFAULT 0,
  `BaseBudget` decimal(12,2) DEFAULT NULL,
  `RiskAllocation` decimal(12,2) DEFAULT NULL,
  `FinalBudget` decimal(12,2) DEFAULT NULL,
  PRIMARY KEY (`ProjectID`),
  KEY `ManagerID` (`ManagerID`),
  CONSTRAINT `projects_ibfk_2` FOREIGN KEY (`ManagerID`) REFERENCES `users` (`UserID`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `risk_assessment`
--

DROP TABLE IF EXISTS `risk_assessment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `risk_assessment` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ProjectID` int(11) NOT NULL,
  `budget_risk` int(11) DEFAULT NULL,
  `timeline_risk` int(11) DEFAULT NULL,
  `team_experience_risk` int(11) DEFAULT NULL,
  `scope_complexity_risk` int(11) DEFAULT NULL,
  `external_dependencies_risk` int(11) DEFAULT NULL,
  `unforeseen_risks` int(11) DEFAULT NULL,
  `total_risk_score` decimal(5,2) DEFAULT NULL,
  `risk_percentage` decimal(5,2) DEFAULT NULL,
  `risk_level` enum('Low','Medium','High') DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `risk_assessment_ibfk_1` (`ProjectID`),
  CONSTRAINT `risk_assessment_ibfk_1` FOREIGN KEY (`ProjectID`) REFERENCES `projects` (`ProjectID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `stakeholders`
--

DROP TABLE IF EXISTS `stakeholders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `stakeholders` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `Classification` enum('Person','Group','Department','Institution','Company') DEFAULT NULL,
  `ProjectID` int(11) NOT NULL,
  `Type` enum('Main','Internal','External') DEFAULT NULL,
  `Name` varchar(255) NOT NULL,
  `UserID` int(11) DEFAULT NULL,
  `Rank` int(11) NOT NULL,
  `TeamIDs` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID`),
  KEY `stakeholders_ibfk_1` (`ProjectID`),
  KEY `fk_stakeholders_user` (`UserID`),
  CONSTRAINT `fk_stakeholders_user` FOREIGN KEY (`UserID`) REFERENCES `users` (`UserID`) ON DELETE CASCADE,
  CONSTRAINT `stakeholders_ibfk_1` FOREIGN KEY (`ProjectID`) REFERENCES `projects` (`ProjectID`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tasks`
--

DROP TABLE IF EXISTS `tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tasks` (
  `TaskID` int(11) NOT NULL AUTO_INCREMENT,
  `TeamID` int(11) NOT NULL,
  `ProjectID` int(11) NOT NULL,
  `Deadline` date NOT NULL,
  `Status` enum('Not Started','In Progress','Completed','Blocked') NOT NULL,
  PRIMARY KEY (`TaskID`),
  KEY `TeamID` (`TeamID`),
  KEY `tasks_ibfk_2` (`ProjectID`),
  CONSTRAINT `tasks_ibfk_1` FOREIGN KEY (`TeamID`) REFERENCES `teams` (`TeamID`) ON DELETE CASCADE,
  CONSTRAINT `tasks_ibfk_2` FOREIGN KEY (`ProjectID`) REFERENCES `projects` (`ProjectID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `teams`
--

DROP TABLE IF EXISTS `teams`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `teams` (
  `TeamID` int(11) NOT NULL AUTO_INCREMENT,
  `TeamName` varchar(255) NOT NULL,
  `TeamLeaderID` int(11) DEFAULT NULL,
  `Cost` decimal(10,2) DEFAULT 0.00,
  `Currency` varchar(3) DEFAULT 'USD',
  PRIMARY KEY (`TeamID`),
  KEY `fk_team_leader` (`TeamLeaderID`),
  CONSTRAINT `fk_team_leader` FOREIGN KEY (`TeamLeaderID`) REFERENCES `users` (`UserID`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `TeamID` int(11) DEFAULT NULL,
  `UserID` int(11) NOT NULL AUTO_INCREMENT,
  `Name` varchar(255) NOT NULL,
  `Email` varchar(255) NOT NULL,
  `Password` varchar(255) NOT NULL,
  `Role` enum('Project Manager','Participant','Team Lead','Admin','Main Stakeholder') NOT NULL,
  `Cost` decimal(10,2) DEFAULT 0.00,
  `Currency` varchar(3) DEFAULT 'USD',
  PRIMARY KEY (`UserID`),
  UNIQUE KEY `Email` (`Email`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-05-07 22:02:22
