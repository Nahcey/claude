package com.example.board;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

// Spring Boot 애플리케이션의 시작 지점임을 표시
// (@Configuration + @EnableAutoConfiguration + @ComponentScan 세 가지를 합친 메타 어노테이션)
@SpringBootApplication
public class BoardApplication {

    public static void main(String[] args) {
        // 내장 톰캣을 띄우고 Spring 컨텍스트를 초기화
        SpringApplication.run(BoardApplication.class, args);
    }
}
